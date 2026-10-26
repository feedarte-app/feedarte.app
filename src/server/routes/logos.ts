// Dynamic logo libraries: per project, a feed field (usually "brand") → logo image per value.
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq, and, sql as dsql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, schema, sqlClient as sql } from '../db';
import { HttpError, requireUser } from '../auth';
import { getProject } from '../access';
import { normKey } from '../../shared/fields';
import * as storage from '../storage';
import { queueRender } from '../feed/sync';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
function sniff(buf: Buffer): string | null {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  const head = buf.slice(0, 512).toString('utf8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

/** distinct values of a field across all feeds of the project, with product counts */
async function fieldValues(projectId: string, field: string) {
  return sql<{ value: string; count: number }[]>`
    select v as value, count(*)::int as count from (
      select coalesce(case jsonb_typeof(p.data->${field}) when 'array' then p.data->${field}->>0 else p.data->>${field} end, '') as v
      from products p join feeds f on f.id = p.feed_id where f.project_id = ${projectId}
    ) t where v <> '' group by v order by count(*) desc limit 2000`;
}

/** filename → best matching value ("tommy-hilfiger_logo.png" → "Tommy Hilfiger") */
function matchFile(filename: string, keys: Map<string, string>): string | null {
  const base = normKey(filename.replace(/\.[a-z0-9]+$/i, '').replace(/(^|[-_ ])(logo|лого|logotype|brand)([-_ ]|$)/gi, ' '));
  if (!base) return null;
  if (keys.has(base)) return base;
  let best: string | null = null;
  for (const k of keys.keys()) if (k.length >= 3 && (base.includes(k) || k.includes(base)) && (!best || k.length > best.length)) best = k;
  return best;
}

async function rerenderProject(projectId: string) {
  const ds = await db
    .select({ id: schema.designs.id })
    .from(schema.designs)
    .innerJoin(schema.feeds, eq(schema.feeds.id, schema.designs.feedId))
    .where(and(eq(schema.feeds.projectId, projectId), eq(schema.designs.active, true), dsql`${schema.designs.published} is not null`));
  for (const d of ds) await queueRender(d.id, 3);
}

export async function logoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/api/projects/:id/logos', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const field = z.string().min(1).max(100).default('brand').parse((req.query as any).field);
    const map = p.logoMaps?.[field] ?? {};
    const values = await fieldValues(p.id, field);
    const seen = new Set<string>();
    const rows = values.map((v) => {
      const key = normKey(v.value);
      seen.add(key);
      return { value: v.value, key, count: v.count, url: map[key] ?? null };
    });
    // logos uploaded for values that are not (or no longer) in the feeds
    for (const [key, url] of Object.entries(map)) if (!seen.has(key)) rows.push({ value: key, key, count: 0, url });
    return { field, rows, fields: Object.keys(p.logoMaps ?? {}) };
  });

  // upload one or many logos; value comes from the form or is matched by file name
  app.post('/api/projects/:id/logos', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const fields: Record<string, string> = {};
    const files: { name: string; buf: Buffer }[] = [];
    for await (const part of req.parts({ limits: { fileSize: 5 * 1024 * 1024, files: 300 } })) {
      if (part.type === 'file') files.push({ name: part.filename ?? 'logo', buf: await part.toBuffer() });
      else fields[part.fieldname] = String(part.value ?? '');
    }
    const field = (fields.field || 'brand').slice(0, 100);
    if (!files.length) throw new HttpError(400, 'Додайте файли логотипів');
    const values = await fieldValues(p.id, field);
    const keys = new Map(values.map((v) => [normKey(v.value), v.value]));
    const matched: { file: string; value: string }[] = [];
    const unmatched: string[] = [];
    const [fresh] = await db.select({ logoMaps: schema.projects.logoMaps }).from(schema.projects).where(eq(schema.projects.id, p.id));
    const maps = { ...(fresh?.logoMaps ?? {}) };
    const map = { ...(maps[field] ?? {}) };
    for (const f of files) {
      const type = sniff(f.buf);
      if (!type) {
        unmatched.push(`${f.name} (не зображення)`);
        continue;
      }
      const key = fields.value ? normKey(fields.value) : matchFile(f.name, keys);
      if (!key) {
        unmatched.push(f.name);
        continue;
      }
      const assetKey = `a/${crypto.randomUUID()}.${EXT[type]}`;
      await storage.put(assetKey, f.buf);
      await db.insert(schema.assets).values({ projectId: p.id, name: `Логотип: ${keys.get(key) ?? fields.value ?? key}`, key: assetKey, mime: type, size: f.buf.length });
      map[key] = `/${assetKey}`;
      matched.push({ file: f.name, value: keys.get(key) ?? fields.value ?? key });
    }
    maps[field] = map;
    await db.update(schema.projects).set({ logoMaps: maps }).where(eq(schema.projects.id, p.id));
    if (matched.length) await rerenderProject(p.id);
    return { matched, unmatched };
  });

  app.delete('/api/projects/:id/logos', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const q = z.object({ field: z.string().default('brand'), key: z.string().min(1) }).parse(req.query);
    const maps = { ...(p.logoMaps ?? {}) };
    if (maps[q.field]) {
      const m = { ...maps[q.field] };
      delete m[q.key];
      maps[q.field] = m;
      await db.update(schema.projects).set({ logoMaps: maps }).where(eq(schema.projects.id, p.id));
      await rerenderProject(p.id);
    }
    return { ok: true };
  });
}
