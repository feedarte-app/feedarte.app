import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { HttpError, type SessionUser } from './auth';

function can(user: SessionUser, ownerId: string) {
  return user.role === 'admin' || user.id === ownerId;
}

export async function getProject(user: SessionUser, id: string) {
  if (!isUuid(id)) throw new HttpError(404, 'Проєкт не знайдено');
  const p = await db.query.projects.findFirst({ where: eq(schema.projects.id, id) });
  if (!p || !can(user, p.ownerId)) throw new HttpError(404, 'Проєкт не знайдено');
  return p;
}

export async function getFeed(user: SessionUser, id: string) {
  if (!isUuid(id)) throw new HttpError(404, 'Фід не знайдено');
  const rows = await db
    .select({ feed: schema.feeds, project: schema.projects })
    .from(schema.feeds)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.feeds.projectId))
    .where(eq(schema.feeds.id, id))
    .limit(1);
  const r = rows[0];
  if (!r || !can(user, r.project.ownerId)) throw new HttpError(404, 'Фід не знайдено');
  return r;
}

export async function getDesign(user: SessionUser, id: string) {
  if (!isUuid(id)) throw new HttpError(404, 'Дизайн не знайдено');
  const rows = await db
    .select({ design: schema.designs, feed: schema.feeds, project: schema.projects })
    .from(schema.designs)
    .innerJoin(schema.feeds, eq(schema.feeds.id, schema.designs.feedId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.feeds.projectId))
    .where(eq(schema.designs.id, id))
    .limit(1);
  const r = rows[0];
  if (!r || !can(user, r.project.ownerId)) throw new HttpError(404, 'Дизайн не знайдено');
  return r;
}

export function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
