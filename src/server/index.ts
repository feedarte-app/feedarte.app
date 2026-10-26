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
import { bootstrapAdmin, HttpError, loadUser } from './auth';
import { authRoutes } from './routes/auth';
import { projectRoutes } from './routes/projects';
import { mediaRoutes } from './routes/media';
import { adminRoutes } from './routes/admin';
import { importRoutes } from './routes/import';
import { logoRoutes } from './routes/logos';
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
        if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Bad origin');
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
    return { version: env.appVersion, deploy: s ? JSON.parse(s) : null, log: read('last-deploy.log') };
  });

  await app.register(authRoutes);
  await app.register(projectRoutes);
  await app.register(mediaRoutes);
  await app.register(adminRoutes);
  await app.register(importRoutes);
  await app.register(logoRoutes);

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
    serveFrom(path.join(publicDir, 'feeds'), () => ({ 'cache-control': 'public, max-age=300', 'content-type': 'application/xml; charset=utf-8' })),
  );
  // fonts for the editor (same files as the server renderer)
  app.get('/fonts/*', serveFrom(env.fontsDir, () => ({ 'cache-control': longCache })));

  // SPA
  if (fs.existsSync(env.webDir)) {
    app.get('/assets/*', serveFrom(path.join(env.webDir, 'assets'), () => ({ 'cache-control': longCache })));
    app.get('/favicon.svg', (_req, reply) => reply.sendFile('favicon.svg', env.webDir));
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET' || !fs.existsSync(env.webDir)) return reply.status(404).send({ error: 'Не знайдено' });
    reply.header('cache-control', 'no-cache');
    return reply.sendFile('index.html', env.webDir);
  });

  await app.listen({ port: env.port, host: env.host });
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
