import { z } from 'zod';
import { getMailConfig, letter, sendMail, type MailConfig } from '../mail';
import { eq, sql as dsql } from 'drizzle-orm';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { db, schema, sqlClient as sql } from '../db';
import { getSetting, hashPassword, HttpError, requireAdmin, setSetting, type RegistrationMode } from '../auth';
import { env } from '../env';
import { isUuid } from '../access';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.get('/api/admin/users', async () => {
    const rows = await sql`
      select u.id, u.email, u.name, u.role, u.status, u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
        (select count(*)::int from projects p where p.owner_id = u.id) as "projectCount"
      from users u order by u.created_at desc`;
    return { users: rows };
  });

  app.post('/api/admin/users', async (req) => {
    const b = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        name: z.string().trim().max(100).default(''),
        password: z.string().min(8, 'Пароль — мінімум 8 символів'),
        role: z.enum(['admin', 'user']).default('user'),
      })
      .parse(req.body);
    const exists = await db.query.users.findFirst({ where: eq(schema.users.email, b.email) });
    if (exists) throw new HttpError(409, 'Email вже зайнятий');
    const [u] = await db
      .insert(schema.users)
      .values({ email: b.email, name: b.name, role: b.role, status: 'active', passwordHash: await hashPassword(b.password) })
      .returning({ id: schema.users.id });
    return { id: u.id };
  });

  app.patch('/api/admin/users/:id', async (req) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw new HttpError(404, 'Не знайдено');
    const b = z
      .object({ role: z.enum(['admin', 'user']).optional(), status: z.enum(['active', 'pending', 'blocked']).optional(), name: z.string().optional() })
      .parse(req.body);
    if (id === req.user!.id && (b.role === 'user' || b.status === 'blocked')) throw new HttpError(400, 'Не можна знизити права самому собі');
    await db.update(schema.users).set(b).where(eq(schema.users.id, id));
    if (b.status === 'blocked') await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
    return { ok: true };
  });

  app.post('/api/admin/users/:id/password', async (req) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw new HttpError(404, 'Не знайдено');
    const b = z.object({ password: z.string().min(8, 'Пароль — мінімум 8 символів') }).parse(req.body);
    await db.update(schema.users).set({ passwordHash: await hashPassword(b.password) }).where(eq(schema.users.id, id));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
    return { ok: true };
  });

  app.delete('/api/admin/users/:id', async (req) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw new HttpError(404, 'Не знайдено');
    if (id === req.user!.id) throw new HttpError(400, 'Не можна видалити себе');
    await db.delete(schema.users).where(eq(schema.users.id, id));
    return { ok: true };
  });

  app.get('/api/admin/stats', async () => {
    const [counts] = await sql`select
      (select count(*)::int from users) as users,
      (select count(*)::int from projects) as projects,
      (select count(*)::int from feeds) as feeds,
      (select count(*)::int from designs) as designs,
      (select count(*)::int from products) as products,
      (select count(*)::int from feeds where status = 'error') as "feedErrors"`;
    const queue = await sql`select type, status, count(*)::int as count from jobs
      where status in ('queued','running') or finished_at > now() - interval '24 hours' group by type, status order by type, status`;
    const failures = await sql`select id, type, payload, last_error as "lastError", finished_at as "finishedAt" from jobs
      where status = 'failed' order by finished_at desc limit 20`;
    const feedErrors = await sql`select f.id, f.name, f.last_error as "lastError", f.last_sync_at as "lastSyncAt", p.name as "projectName"
      from feeds f join projects p on p.id = f.project_id where f.status = 'error' order by f.last_sync_at desc limit 20`;
    const workers = await sql`select substr(key, 8) as id, value->>'at' as at, (value->>'running')::int as running
      from settings where key like 'worker:%' and (value->>'at')::timestamptz > now() - interval '3 minutes' order by key`;
    let disk: { free: number; total: number } | null = null;
    try {
      const s = fs.statfsSync(env.dataDir);
      disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
    } catch {
      /* ignore */
    }
    return { counts, queue, failures, feedErrors, workers, disk };
  });

  app.get('/api/admin/projects', async () => {
    const rows = await sql`select p.id, p.name, u.email as "ownerEmail", p.created_at as "createdAt",
      (select count(*)::int from feeds f where f.project_id = p.id) as "feedCount",
      (select coalesce(sum(product_count),0)::int from feeds f where f.project_id = p.id) as "productCount"
      from projects p join users u on u.id = p.owner_id order by p.created_at desc`;
    return { projects: rows };
  });

  const mask = (v: string) => (v ? `${v.slice(0, 6)}…${v.slice(-4)}` : '');
  app.get('/api/admin/settings', async () => ({
    registrationMode: await getSetting<RegistrationMode>('registrationMode', 'approval'),
    figmaToken: mask(await getSetting<string>('figmaToken', '')),
    anthropicKey: mask(await getSetting<string>('anthropicKey', '')),
    mail: await (async () => {
      const m = await getMailConfig();
      return { ...m, resendKey: mask(m.resendKey), smtpPass: m.smtpPass ? '••••••••' : '' };
    })(),
  }));

  /** mail settings: empty secret fields keep the stored value */
  app.put('/api/admin/mail', async (req) => {
    const b = z
      .object({
        provider: z.enum(['none', 'resend', 'smtp']),
        from: z.string().trim().max(200),
        resendKey: z.string().trim().max(300).optional(),
        smtpHost: z.string().trim().max(200).optional(),
        smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
        smtpUser: z.string().trim().max(200).optional(),
        smtpPass: z.string().max(300).optional(),
      })
      .parse(req.body);
    if (b.provider !== 'none' && !/@/.test(b.from)) throw new HttpError(400, 'Вкажіть адресу відправника, наприклад Feedarte <no-reply@feedarte.com>');
    const cur = await getMailConfig();
    const next: MailConfig = {
      provider: b.provider,
      from: b.from,
      resendKey: b.resendKey ? b.resendKey : cur.resendKey,
      smtpHost: b.smtpHost ?? cur.smtpHost,
      smtpPort: b.smtpPort ?? cur.smtpPort,
      smtpUser: b.smtpUser ?? cur.smtpUser,
      smtpPass: b.smtpPass ? b.smtpPass : cur.smtpPass,
    };
    await setSetting('mail', next);
    return { ok: true };
  });

  app.post('/api/admin/mail/test', async (req) => {
    const to = req.user!.email;
    try {
      await sendMail({ to, subject: 'Feedarte: тестовий лист', ...letter({ title: 'Пошта працює ✓', lines: ['Це тестовий лист з адмін-панелі Feedarte. Листи для передачі проєктів надходитимуть так само.'] }) });
    } catch (e) {
      throw new HttpError(400, `Не вдалося надіслати: ${(e as Error).message}`);
    }
    return { ok: true, to };
  });

  app.put('/api/admin/settings', async (req) => {
    const b = z
      .object({
        registrationMode: z.enum(['open', 'approval', 'closed']).optional(),
        figmaToken: z.string().trim().max(300).optional(),
        anthropicKey: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    if (b.registrationMode) await setSetting('registrationMode', b.registrationMode);
    if (b.figmaToken !== undefined) await setSetting('figmaToken', b.figmaToken);
    if (b.anthropicKey !== undefined) await setSetting('anthropicKey', b.anthropicKey);
    return { ok: true };
  });

  app.post('/api/admin/jobs/:id/retry', async (req) => {
    const id = Number((req.params as any).id);
    try {
      await db.execute(dsql`update jobs set status = 'queued', attempts = 0, run_after = now(), finished_at = null where id = ${id} and status = 'failed'`);
    } catch {
      throw new HttpError(409, 'Така задача вже стоїть у черзі');
    }
    return { ok: true };
  });
}
