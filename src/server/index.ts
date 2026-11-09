import { startWatchdog } from './notify';
import { goRoutes } from './routes/go';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { ZodError } from 'zod';
import { env } from './env';
import { runMigrations, sqlClient } from './db';
import { ACCESS_EXPIRED_MSG, bootstrapAdmin, HttpError, loadUser } from './auth';
import { authRoutes } from './routes/auth';
import { projectRoutes } from './routes/projects';
import { mediaRoutes } from './routes/media';
import { adminRoutes } from './routes/admin';
import { importRoutes } from './routes/import';
import { logoRoutes } from './routes/logos';
import { transferRoutes } from './routes/transfers';
import { fontRoutes } from './fonts';
import { ensureDirs, publicDir } from './storage';
import { registerFonts } from './render/engine';

async function main() {
  ensureDirs();
  await runMigrations();
  await bootstrapAdmin();
  registerFonts();

  const app = Fastify({
    logger: { level: env.isProd ? 'info' : 'warn' },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  // tolerate empty JSON bodies on POST (e.g. "sync now" buttons)
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const s = String(body ?? '').trim();
    if (!s) return done(null, {});
    try {
      done(null, JSON.parse(s));
    } catch {
      const err = new Error('Некоректний JSON') as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  await app.register(cookie);
  await app.register(multipart);
  await app.register(rateLimit, { global: false });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    if (req.url.startsWith('/api/')) {
      reply.header('cache-control', 'no-store');
      await loadUser(req);
      // CSRF: state-changing API calls must come from our own origin (cookie is SameSite=Lax too)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.headers.origin;
        let host: string | null = null;
        try {
          host = origin ? new URL(origin).host : null;
        } catch {
          host = '';
        }
        if (origin && host !== req.headers.host) throw new HttpError(403, 'Bad origin');
        // trial / paid period over: account is read-only (feeds keep serving the last images)
        if (req.user?.access.expired && !req.url.startsWith('/api/auth/')) throw new HttpError(402, ACCESS_EXPIRED_MSG);
      }
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: err.issues[0]?.message ?? 'Некоректні дані' });
    }
    const status = (err as any).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.status(status).send({ error: status >= 500 ? 'Внутрішня помилка сервера' : (err as Error).message });
  });

  app.get('/api/health', async (_req, reply) => {
    try {
      await sqlClient`select 1`;
    } catch {
      return reply.status(503).send({ ok: false, db: false });
    }
    const [{ alive }] = await sqlClient`select count(*)::int as alive from settings
      where key like 'worker:%' and (value->>'at')::timestamptz > now() - interval '2 minutes'`;
    return { ok: true, db: true, workers: alive, version: env.appVersion };
  });

  // Catalog crawlers (Meta, TikTok) and monitoring must be able to fetch feeds/images
  app.get('/robots.txt', async (_req, reply) => reply.type('text/plain').send('User-agent: *\nAllow: /\n'));

  // Deployment status for maintenance (protected by STATUS_TOKEN from deploy/config.env)
  app.get('/api/deploy-status', async (req, reply) => {
    const token = String((req.query as any).token ?? '');
    if (!env.statusToken || token.length !== env.statusToken.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(env.statusToken)))
      return reply.status(404).send({ error: 'Не знайдено' });
    const read = (f: string) => {
      try {
        return fs.readFileSync(path.join(env.statusDir, f), 'utf8');
      } catch {
        return null;
      }
    };
    const s = read('status.json');
    if ((req.query as any).queue) {
      // operational diagnostics: queue history and render timings (ids only, no customer data)
      const jobs = await sqlClient`
        select id, type, status, priority, attempts, payload->>'designId' as design, payload->>'feedId' as feed,
          created_at, started_at, finished_at,
          extract(epoch from (coalesce(started_at, finished_at) - created_at))::int as wait_s,
          extract(epoch from (finished_at - started_at))::int as run_s, left(last_error, 160) as error
        from jobs where created_at > now() - interval '2 days' order by id desc limit 300`;
      const designs = await sqlClient`
        select d.id, d.feed_id, d.render_status, d.render_stats, d.updated_at,
          (select count(*)::int from products p where p.feed_id = d.feed_id) as products
        from designs d order by d.updated_at desc limit 50`;
      const syncs = await sqlClient`
        select feed_id, started_at, finished_at, status, stats, left(error, 160) as error
        from sync_runs where started_at > now() - interval '1 day' order by id desc limit 100`;
      const feeds = await sqlClient`select id, interval_minutes, enabled, status, next_sync_at from feeds`;
      const workers = await sqlClient`select key, value from settings where key like 'worker:%'`;
      const du = async (dir: string): Promise<{ files: number; mb: number }> => {
        let files = 0, bytes = 0;
        const walk = async (d: string) => {
          let ents: fs.Dirent[] = [];
          try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
          for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) await walk(p);
            else { files++; try { bytes += (await fs.promises.stat(p)).size; } catch { /* gone */ } }
          }
        };
        await walk(dir);
        return { files, mb: Math.round(bytes / 1048576) };
      };
      const disk = {
        rendered: await du(path.join(env.dataDir, 'public', 'r')),
        uploads: await du(path.join(env.dataDir, 'public', 'a')),
        photoCache: await du(path.join(env.dataDir, 'cache', 'img')),
        previewCache: await du(path.join(env.dataDir, 'cache', 'img-s')),
        feeds: await du(path.join(env.dataDir, 'public', 'feeds')),
        db: (await sqlClient`select pg_size_pretty(pg_database_size(current_database())) as size`)[0].size,
        host: read('disk.txt'),
      };
      return { version: env.appVersion, disk, workerConcurrency: env.workerConcurrency, renderConcurrency: env.renderConcurrency, workers, feeds, jobs, designs, syncs };
    }
    return { version: env.appVersion, deploy: s ? JSON.parse(s) : null, log: read('last-deploy.log') };
  });

  await app.register(authRoutes);
  await app.register(projectRoutes);
  await app.register(mediaRoutes);
  await app.register(adminRoutes);
  await app.register(importRoutes);
  await app.register(logoRoutes);
  await app.register(transferRoutes);
  await app.register(fontRoutes);
  await app.register(goRoutes);

  // Static files are served by explicit routes (sendFile with a fixed root per route)
  await app.register(fastifyStatic, { root: publicDir, serve: false });
  const longCache = 'public, max-age=31536000, immutable';
  const serveFrom = (dir: string, headers: (file: string) => Record<string, string>) => (req: any, reply: any) => {
    const file = String(req.params['*'] ?? '');
    if (!file || file.includes('..')) return reply.status(404).send({ error: 'Не знайдено' });
    reply.headers(headers(file));
    return reply.sendFile(file, dir, { cacheControl: false });
  };
  // rendered images — content-hashed names, safe to cache forever
  app.get('/r/*', serveFrom(path.join(publicDir, 'r'), () => ({ 'cache-control': longCache, 'access-control-allow-origin': '*' })));
  // uploaded assets
  app.get(
    '/a/*',
    serveFrom(path.join(publicDir, 'a'), (f) => ({
      'cache-control': longCache,
      'access-control-allow-origin': '*',
      ...(f.endsWith('.svg') ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
    })),
  );
  // output catalog feeds for Meta / TikTok
  app.get(
    '/feeds/*',
    serveFrom(path.join(publicDir, 'feeds'), (f) => ({ 'cache-control': 'public, max-age=300', 'content-type': f.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/xml; charset=utf-8' })),
  );
  // fonts for the editor (same files as the server renderer)
  app.get('/fonts/*', serveFrom(env.fontsDir, () => ({ 'cache-control': longCache })));

  // SPA
  if (fs.existsSync(env.webDir)) {
    app.get('/assets/*', serveFrom(path.join(env.webDir, 'assets'), () => ({ 'cache-control': longCache })));
    app.get('/favicon.svg', (_req, reply) => reply.sendFile('favicon.svg', env.webDir));
    // knowledge-base screenshots and animations
    app.get('/help-media/*', serveFrom(path.join(env.webDir, 'help-media'), () => ({ 'cache-control': 'public, max-age=86400' })));
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET' || !fs.existsSync(env.webDir)) return reply.status(404).send({ error: 'Не знайдено' });
    reply.header('cache-control', 'no-cache');
    return reply.sendFile('index.html', env.webDir);
  });

  await app.listen({ port: env.port, host: env.host });
  startWatchdog();
  console.log(`Feedarte API on :${env.port}`);

  const shutdown = async () => {
    await app.close();
    await sqlClient.end({ timeout: 5 });
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
