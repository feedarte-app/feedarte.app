import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, sql as dsql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, schema } from './db';
import { env } from './env';

export const COOKIE = 'fc_session';
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string; name: string; role: 'admin' | 'user' };

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export const hashPassword = (p: string) => bcrypt.hash(p, 11);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(reply: FastifyReply, userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ id: sha(token), userId, expiresAt });
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.secureCookies,
    expires: expiresAt,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[COOKIE];
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha(token)));
  reply.clearCookie(COOKIE, { path: '/' });
}

export async function loadUser(req: FastifyRequest) {
  const token = req.cookies[COOKIE];
  if (!token) return;
  const rows = await db
    .select({ u: schema.users, s: schema.sessions })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, sha(token)))
    .limit(1);
  const r = rows[0];
  if (!r || r.s.expiresAt < new Date() || r.u.status !== 'active') return;
  req.user = { id: r.u.id, email: r.u.email, name: r.u.name, role: r.u.role };
}

export async function requireUser(req: FastifyRequest) {
  if (!req.user) throw new HttpError(401, 'Потрібно увійти');
}

export async function requireAdmin(req: FastifyRequest) {
  if (!req.user) throw new HttpError(401, 'Потрібно увійти');
  if (req.user.role !== 'admin') throw new HttpError(403, 'Лише для адміністратора');
}

export type RegistrationMode = 'open' | 'approval' | 'closed';

export async function getSetting<T>(key: string, def: T): Promise<T> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  return (row?.value as T) ?? def;
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(schema.settings)
    .values({ key, value: value as any })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}

export async function bootstrapAdmin() {
  if (!env.adminEmail || !env.adminPassword) return;
  const email = env.adminEmail.toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) return;
  await db.insert(schema.users).values({
    email,
    name: 'Admin',
    passwordHash: await hashPassword(env.adminPassword),
    role: 'admin',
    status: 'active',
  });
}

export async function userCount() {
  const [r] = await db.select({ c: dsql<number>`count(*)::int` }).from(schema.users);
  return r.c;
}
