import { appLink, notify, tgEsc } from '../notify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, schema, sqlClient } from '../db';
import {
  createSession,
  destroySession,
  getSetting,
  hashPassword,
  HttpError,
  requireUser,
  userCount,
  verifyPassword,
  type RegistrationMode, sessionUser, trialDays
} from '../auth';

const creds = z.object({
  email: z.string().trim().toLowerCase().email('Некоректний email').max(200),
  password: z.string().min(8, 'Пароль — мінімум 8 символів').max(200),
});

export async function authRoutes(app: FastifyInstance) {
  const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/api/auth/config', async () => {
    const mode = await getSetting<RegistrationMode>('registrationMode', 'approval');
    return { registrationMode: (await userCount()) === 0 ? 'open' : mode, contactTelegram: await getSetting<string>('contactTelegram', ''), trialDays: await trialDays() };
  });

  app.post('/api/auth/register', limited, async (req, reply) => {
    const body = creds.extend({ name: z.string().trim().max(100).default('') }).parse(req.body);
    // serialize registrations so two simultaneous first sign-ups can't both become admin
    // (transaction-scoped lock: released automatically, independent of pool connections)
    let result: unknown;
    await sqlClient.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(727003)`;
      result = await registerLocked(body, reply);
    });
    return result;
  });

  async function registerLocked(body: { email: string; password: string; name: string }, reply: any) {
    const first = (await userCount()) === 0;
    const mode = first ? 'open' : await getSetting<RegistrationMode>('registrationMode', 'approval');
    if (mode === 'closed') throw new HttpError(403, 'Реєстрацію закрито. Зверніться до адміністратора.');
    const exists = await db.query.users.findFirst({ where: eq(schema.users.email, body.email) });
    if (exists) throw new HttpError(409, 'Користувач з таким email вже існує');
    const [u] = await db
      .insert(schema.users)
      .values({
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        role: first ? 'admin' : 'user',
        status: mode === 'approval' ? 'pending' : 'active',
        ...(first || mode === 'approval' ? {} : { plan: 'trial' as const, accessUntil: new Date(Date.now() + (await trialDays()) * 86400000) }),
      })
      .returning();
    if (!first) {
      const who = `${tgEsc(u.email)}${u.name ? ` (${tgEsc(u.name)})` : ''}`;
      if (u.status === 'pending') notify('pending', `⏳ <b>Нова реєстрація чекає підтвердження</b>\n${who}\n${appLink('/admin', 'Відкрити адмін-панель')}`);
      else notify('register', `🎉 <b>Нова реєстрація</b>\n${who}`);
    }
    if (u.status === 'pending') return { pending: true };
    await createSession(reply, u.id);
    return { user: sessionUser(u) };
  }

  app.post('/api/auth/login', limited, async (req, reply) => {
    const body = creds.parse(req.body);
    const u = await db.query.users.findFirst({ where: eq(schema.users.email, body.email) });
    if (!u || !(await verifyPassword(body.password, u.passwordHash))) throw new HttpError(401, 'Невірний email або пароль');
    if (u.status === 'pending') throw new HttpError(403, 'Обліковий запис очікує підтвердження адміністратором');
    if (u.status === 'blocked') throw new HttpError(403, 'Обліковий запис заблоковано');
    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    await createSession(reply, u.id);
    return { user: sessionUser(u) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ user: req.user ?? null }));

  app.post('/api/auth/password', { preHandler: requireUser, ...limited }, async (req) => {
    const body = z.object({ current: z.string(), next: z.string().min(8, 'Пароль — мінімум 8 символів') }).parse(req.body);
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    if (!u || !(await verifyPassword(body.current, u.passwordHash))) throw new HttpError(400, 'Поточний пароль невірний');
    await db.update(schema.users).set({ passwordHash: await hashPassword(body.next) }).where(eq(schema.users.id, u.id));
    return { ok: true };
  });
}
