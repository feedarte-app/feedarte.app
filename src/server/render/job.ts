import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient as sql } from '../db';
import { env } from '../env';
import { ProductContext, evalCondition } from '../../shared/fields';
import { resolveDesign, resolvedFingerprint } from '../../shared/render';
import type { ProductData } from '../../shared/types';
import { DEFAULT_OUTPUT, type DesignOutputSettings } from '../db/schema';
import { renderPool } from './pool';
import { fontsUsedBy, projectFonts } from '../fonts';
import type { RenderResult } from './engine';
import * as storage from '../storage';
import { OutputWriter, type OutputItem } from './output';
import { log } from '../log';
import { refreshCombined, saveImageMap, type ImageMap } from './combined';

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

  const [proj] = await sql<{ id: string; logo_maps: any }[]>`select p.id, p.logo_maps from projects p join feeds f on f.project_id = p.id where f.id = ${design.feedId}`;
  const logoMaps = proj?.logo_maps ?? {};
  const fonts = proj ? fontsUsedBy(doc, await projectFonts(proj.id)) : [];
  const prefix = `r/${designId}`;
  const existing = new Set((await storage.list(prefix)).map((f) => f.name));
  const docHash = crypto.createHash('sha1').update(JSON.stringify([doc, ext, out.quality, fonts.map((f) => f.key)])).digest('hex');
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
  const imageMap: ImageMap = {};
  let lastBeat = Date.now();

  // a user publishing the design again while this (now stale) render runs: stop early, the new job takes over
  let superseded = false;
  const watch = setInterval(async () => {
    try {
      const [q] = await sql`select 1 from jobs where dedupe_key = ${'render:' + designId} and status = 'queued' and priority <= 3 limit 1`;
      if (q) superseded = true;
    } catch {
      /* ignore */
    }
  }, 4000);

  const dropped = out.variants === 'one_per_group' ? await variantDuplicates(design.feedId, out, doc.format) : new Set<number>();

  try {
  for (;;) {
    if (superseded) break;
    const rows = await sql<{ id: number; data: ProductData }[]>`
      select id, data from products where feed_id = ${design.feedId} and id > ${lastId} order by id limit ${PAGE}`;
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;

    const tasks: { idx: number; name: string; resolved: ReturnType<typeof resolveDesign> }[] = [];
    const pageItems: OutputItem[] = rows.map((row, idx) => {
      if (dropped.has(row.id)) return { data: row.data, image: null, skip: true };
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
      if (superseded) return;
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
      p = renderPool.run({ resolved: t.resolved, ext, quality: out.quality, key: `${prefix}/${t.name}`, fonts }).then((r) => {
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
      if (!it.skip) {
        included++;
        const ext = Array.isArray(it.data['id']) ? it.data['id'][0] : it.data['id'];
        if (ext) imageMap[ext] = it.image;
      }
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

  if (superseded) {
    clearInterval(watch);
    await writer.abort();
    log.info({ designId, processed }, 'render superseded by a newer publish');
    return;
  }
  const still = await db.query.designs.findFirst({ where: eq(schema.designs.id, designId), columns: { id: true } });
  if (!still) {
    // design/feed deleted while rendering — don't resurrect a public feed
    await writer.abort();
    await storage.remove(prefix);
    return;
  }
  await writer.close();
  await saveImageMap(designId, imageMap);
  } catch (e) {
    await writer.abort();
    throw e;
  } finally {
    clearInterval(watch);
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
  await refreshCombined(design.feedId, designId).catch((e) => log.error({ err: e, designId }, 'combined refresh failed'));
  return stats;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
const inStock = (d: ProductData) => /^(in[ _]?stock|available|preorder|pre[ _]order)$/i.test(one(d['availability']));

/**
 * Row ids to leave out so that only one variant per (item_group_id, color) remains.
 * Keeps the first in-stock variant (feed order); if none is in stock, the first one.
 * Only candidates that would be included anyway (filter / mode) compete, so the kept one actually appears.
 */
export async function variantDuplicates(feedId: string, out: DesignOutputSettings, format: ConstructorParameters<typeof ProductContext>[1]): Promise<Set<number>> {
  const best = new Map<string, { id: number; stock: boolean }>();
  const all: { id: number; key: string }[] = [];
  let lastId = 0;
  for (;;) {
    const rows = await sql<{ id: number; data: ProductData }[]>`
      select id, data from products where feed_id = ${feedId} and id > ${lastId} order by id limit ${PAGE}`;
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;
    for (const r of rows) {
      const g = one(r.data['item_group_id']);
      if (!g) continue;
      if (out.mode === 'only' && out.filter && !evalCondition(out.filter, new ProductContext(r.data, format))) continue;
      const key = `${g}|${one(r.data['color']).toLowerCase()}`;
      const stock = inStock(r.data);
      all.push({ id: r.id, key });
      const cur = best.get(key);
      if (!cur || (stock && !cur.stock)) best.set(key, { id: r.id, stock });
    }
  }
  const drop = new Set<number>();
  for (const a of all) if (best.get(a.key)!.id !== a.id) drop.add(a.id);
  return drop;
}
