import { eventOn, getTgConfig, sendTg, setTgConfig, tgApi, tgEsc, TG_DEFAULT, TG_EVENTS, type TgEvent } from '../notify';
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
      select u.id, u.email, u.name, u.role, u.status, u.plan, u.access_until as "accessUntil", u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
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

  /** manual billing: start trial / extend paid access / unlimited */
  app.post('/api/admin/users/:id/access', async (req) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw new HttpError(404, 'Не знайдено');
    const b = z
      .object({ action: z.enum(['trial', 'extend', 'until', 'unlimited']), days: z.coerce.number().int().min(1).max(3660).optional(), until: z.string().optional() })
      .parse(req.body);
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
    if (!u) throw new HttpError(404, 'Не знайдено');
    const DAY = 86400000;
    let set: Partial<typeof schema.users.$inferInsert>;
    if (b.action === 'trial') set = { plan: 'trial', accessUntil: new Date(Date.now() + (b.days ?? (await getSetting<number>('trialDays', 14))) * DAY), status: 'active' };
    else if (b.action === 'extend') {
      const from = Math.max(Date.now(), u.accessUntil?.getTime() ?? 0);
      set = { plan: 'paid', accessUntil: new Date(from + (b.days ?? 30) * DAY), status: 'active' };
    } else if (b.action === 'until') {
      const d = b.until ? new Date(b.until) : null;
      if (!d || isNaN(d.getTime())) throw new HttpError(400, 'Некоректна дата');
      d.setHours(23, 59, 59, 0);
      set = { accessUntil: d, plan: u.plan ?? 'paid' };
    } else set = { plan: null, accessUntil: null };
    await db.update(schema.users).set(set).where(eq(schema.users.id, id));
    // frozen feeds resume on the next scheduler tick
    if (set.accessUntil === null || (set.accessUntil && set.accessUntil.getTime() > Date.now()))
      await sql`update feeds set next_sync_at = least(next_sync_at, now()) where project_id in (select id from projects where owner_id = ${id}) and next_sync_at < now() - interval '1 hour'`;
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
    contactTelegram: await getSetting<string>('contactTelegram', ''),
    trialDays: await getSetting<number>('trialDays', 14),
    figmaToken: mask(await getSetting<string>('figmaToken', '')),
    anthropicKey: mask(await getSetting<string>('anthropicKey', '')),
    telegram: await (async () => {
      const t = await getTgConfig(true);
      return {
        token: mask(t.token),
        hasToken: !!t.token,
        chatId: t.chatId,
        chatTitle: t.chatTitle,
        events: Object.fromEntries(Object.keys(TG_EVENTS).map((k) => [k, eventOn(t, k as TgEvent)])),
        eventLabels: Object.fromEntries(Object.entries(TG_EVENTS).map(([k, v]) => [k, v.label])),
      };
    })(),
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
        contactTelegram: z.string().trim().max(64).optional(),
        trialDays: z.coerce.number().int().min(1).max(90).optional(),
      })
      .parse(req.body);
    if (b.contactTelegram !== undefined) {
      const h = b.contactTelegram.replace(/^(https?:\/\/)?(t\.me\/)?@?/i, '').replace(/\/.*$/, '');
      if (h && !/^[A-Za-z0-9_]{4,32}$/.test(h)) throw new HttpError(400, 'Вкажіть Telegram-нік, наприклад @feedarte');
      await setSetting('contactTelegram', h);
    }
    if (b.trialDays) await setSetting('trialDays', b.trialDays);
    if (b.registrationMode) await setSetting('registrationMode', b.registrationMode);
    if (b.figmaToken !== undefined) await setSetting('figmaToken', b.figmaToken);
    if (b.anthropicKey !== undefined) await setSetting('anthropicKey', b.anthropicKey);
    return { ok: true };
  });


  // ---------- Telegram developer notifications ----------
  app.put('/api/admin/telegram', async (req) => {
    const b = z
      .object({
        token: z.string().trim().max(200).optional(),
        events: z.record(z.string(), z.boolean()).optional(),
      })
      .parse(req.body);
    const cur = await getTgConfig(true);
    const next = { ...cur };
    if (b.token) {
      if (!/^\d+:[\w-]{20,}$/.test(b.token)) throw new HttpError(400, 'Схоже, це не токен бота. Він виглядає так: 123456789:AAH…');
      try {
        await tgApi(b.token, 'getMe');
      } catch (e) {
        throw new HttpError(400, `Telegram не прийняв токен: ${(e as Error).message}`);
      }
      if (b.token !== cur.token) Object.assign(next, { token: b.token, chatId: '', chatTitle: '' });
    }
    if (b.events) next.events = { ...cur.events, ...Object.fromEntries(Object.entries(b.events).filter(([k]) => k in TG_EVENTS)) };
    await setTgConfig(next);
    return { ok: true };
  });

  /** find the chat that last wrote to the bot (the admin presses Start / sends any message first) */
  app.post('/api/admin/telegram/detect', async () => {
    const cur = await getTgConfig(true);
    if (!cur.token) throw new HttpError(400, 'Спершу збережіть токен бота');
    let updates: any[];
    try {
      updates = await tgApi<any[]>(cur.token, 'getUpdates', { limit: 50, timeout: 0 });
    } catch (e) {
      throw new HttpError(400, `Telegram: ${(e as Error).message}`);
    }
    const msgs = updates.map((u) => u.message ?? u.my_chat_member ?? u.channel_post).filter((m) => m?.chat);
    const last = msgs[msgs.length - 1];
    if (!last) throw new HttpError(404, 'Бот ще не отримав повідомлень. Відкрийте бота в Telegram, натисніть «Start» (або напишіть будь-що) і спробуйте ще раз.');
    const c = last.chat;
    const title = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || String(c.id);
    await setTgConfig({ ...cur, chatId: String(c.id), chatTitle: title + (c.username ? ` (@${c.username})` : '') });
    await sendTg({ ...cur, chatId: String(c.id) }, '✅ <b>Feedarte підключено</b>\nСюди надходитимуть сповіщення для розробника сервісу.').catch(() => {});
    return { ok: true, chatTitle: title };
  });

  app.post('/api/admin/telegram/test', async () => {
    const cur = await getTgConfig(true);
    if (!cur.token || !cur.chatId) throw new HttpError(400, 'Бот ще не підключений');
    try {
      await sendTg(cur, `🔔 <b>Тестове сповіщення Feedarte</b>\nВерсія ${tgEsc(env.appVersion)} · ${tgEsc(new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }))}`);
    } catch (e) {
      throw new HttpError(400, `Не вдалося надіслати: ${(e as Error).message}`);
    }
    return { ok: true };
  });

  app.delete('/api/admin/telegram', async () => {
    await setTgConfig({ ...TG_DEFAULT });
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
