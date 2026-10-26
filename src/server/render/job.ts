import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient as sql } from '../db';
import { env } from '../env';
import { ProductContext, evalCondition } from '../../shared/fields';
import { resolveDesign, resolvedFingerprint } from '../../shared/render';
import type { ProductData } from '../../shared/types';
import { DEFAULT_OUTPUT } from '../db/schema';
import { renderPool } from './pool';
import type { RenderResult } from './engine';
import * as storage from '../storage';
import { OutputWriter, type OutputItem } from './output';
import { log } from '../log';

const PAGE = 1000;
const GC_GRACE_MS = 3 * 24 * 3600 * 1000; // keep unreferenced images 3 days (ads platforms cache)

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

export async function renderDesignJob(designId: string, heartbeat?: () => Promise<void>) {
  const design = await db.query.designs.findFirst({ where: eq(schema.designs.id, designId) });
  if (!design || !design.published) return;
  const doc = design.published;
  const out = { ...DEFAULT_OUTPUT, ...(design.output ?? {}) };
  const ext = out.imageFormat === 'png' ? 'png' : 'jpg';
  const started = Date.now();
  await db.update(schema.designs).set({ renderStatus: 'rendering', renderProgress: 0, renderError: null }).where(eq(schema.designs.id, designId));

  const [proj] = await sql<{ logo_maps: any }[]>`select p.logo_maps from projects p join feeds f on f.project_id = p.id where f.id = ${design.feedId}`;
  const logoMaps = proj?.logo_maps ?? {};
  const prefix = `r/${designId}`;
  const existing = new Set((await storage.list(prefix)).map((f) => f.name));
  const docHash = crypto.createHash('sha1').update(JSON.stringify([doc, ext, out.quality])).digest('hex');
  const [{ count: total }] = await sql<{ count: number }[]>`select count(*)::int as count from products where feed_id = ${design.feedId}`;

  const used = new Set<string>();
  const inFlight = new Map<string, Promise<RenderResult>>();
  const failures: { id: string; title: string; reason: string; url?: string }[] = [];
  const noteFail = (data: ProductData, r: RenderResult) => {
    failed++;
    if (failures.length < 100 && !r.ok) {
      const one = (k: string) => { const v = data[k]; return Array.isArray(v) ? v[0] ?? '' : v ?? ''; };
      failures.push({ id: one('id'), title: one('title').slice(0, 160), reason: r.reason, url: r.url });
    }
  };
  const writer = new OutputWriter(design.publicToken, design.name, out.keepOriginalAsAdditional);
  let included = 0;
  let rendered = 0;
  let reused = 0;
  let failed = 0;
  let processed = 0;
  let lastId = 0;
  let thumb: string | null = null;
  let lastBeat = Date.now();

  try {
  for (;;) {
    const rows = await sql<{ id: number; data: ProductData }[]>`
      select id, data from products where feed_id = ${design.feedId} and id > ${lastId} order by id limit ${PAGE}`;
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;

    const tasks: { idx: number; name: string; resolved: ReturnType<typeof resolveDesign> }[] = [];
    const pageItems: OutputItem[] = rows.map((row, idx) => {
      const ctx = new ProductContext(row.data, doc.format);
      const include = evalCondition(out.filter, ctx);
      if (!include) return { data: row.data, image: null, skip: out.mode === 'only' };
      const resolved = resolveDesign(doc, ctx, logoMaps);
      const fp = crypto.createHash('sha1').update(docHash).update(resolvedFingerprint(resolved)).digest('hex').slice(0, 24);
      const name = `${fp}.${ext}`;
      tasks.push({ idx, name, resolved });
      return { data: row.data, image: name, skip: false };
    });

    await pool(tasks, Math.max(env.renderConcurrency, renderPool.size * 2), async (t) => {
      used.add(t.name);
      if (existing.has(t.name)) {
        reused++;
        return;
      }
      let p = inFlight.get(t.name);
      if (p) {
        // another variant with identical visual output is already being rendered
        reused++;
        const shared = await p;
        if (!shared.ok) {
          pageItems[t.idx].image = null;
          noteFail(pageItems[t.idx].data, shared);
        }
        return;
      }
      p = renderPool.run({ resolved: t.resolved, ext, quality: out.quality, key: `${prefix}/${t.name}` }).then((r) => {
        if (r.ok) {
          existing.add(t.name);
          rendered++;
        }
        return r;
      });
      inFlight.set(t.name, p);
      const r = await p;
      inFlight.delete(t.name);
      if (!r.ok) {
        pageItems[t.idx].image = null;
        noteFail(pageItems[t.idx].data, r);
      }
    });

    for (const it of pageItems) {
      if (it.image && !thumb) thumb = `/${prefix}/${it.image}`;
      if (it.image) it.image = storage.publicUrl(`${prefix}/${it.image}`);
      if (!it.skip) included++;
    }
    await writer.write(pageItems);
    processed += rows.length;
    await db
      .update(schema.designs)
      .set({ renderProgress: total ? Math.round((processed / total) * 100) : 100 })
      .where(eq(schema.designs.id, designId));
    if (Date.now() - lastBeat > 30000) {
      lastBeat = Date.now();
      await heartbeat?.();
    }
  }

  const still = await db.query.designs.findFirst({ where: eq(schema.designs.id, designId), columns: { id: true } });
  if (!still) {
    // design/feed deleted while rendering — don't resurrect a public feed
    await writer.abort();
    await storage.remove(prefix);
    return;
  }
  await writer.close();
  } catch (e) {
    await writer.abort();
    throw e;
  }

  // garbage-collect images no longer referenced (after grace period)
  const now = Date.now();
  for (const f of await storage.list(prefix)) {
    if (!used.has(f.name) && now - f.mtimeMs > GC_GRACE_MS) await storage.remove(`${prefix}/${f.name}`);
  }
  // touch used files so GC grace counts from last use
  for (const name of used) {
    const p = path.join(storage.publicDir, prefix, name);
    try {
      const t = new Date();
      fs.utimesSync(p, t, t);
    } catch {
      /* ignore */
    }
  }

  const stats = { total, rendered, reused, failed, failures, included, ms: Date.now() - started, at: new Date().toISOString() };
  await db
    .update(schema.designs)
    .set({ renderStatus: 'ok', renderStats: stats, renderProgress: 100, thumbnail: thumb ?? design.thumbnail })
    .where(eq(schema.designs.id, designId));
  log.info({ designId, ...stats }, 'design rendered');
  return stats;
}
