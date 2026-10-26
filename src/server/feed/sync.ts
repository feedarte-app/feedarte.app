import crypto from 'node:crypto';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { db, schema, sqlClient as sql } from '../db';
import { env } from '../env';
import { safeFetch } from '../net';
import { enqueue } from '../queue';
import { FeedStreamParser, productExternalId, productTitle } from './parse';
import type { FeedField, ProductData } from '../../shared/types';
import { log } from '../log';

const BATCH = 500;

function hashData(d: ProductData) {
  return crypto.createHash('sha1').update(JSON.stringify(d)).digest('hex');
}

export async function syncFeed(feedId: string, opts: { force?: boolean; heartbeat?: () => Promise<void> } = {}) {
  const feed = await db.query.feeds.findFirst({ where: eq(schema.feeds.id, feedId) });
  if (!feed) return;
  const started = Date.now();
  const runStart = new Date();
  const runIso = runStart.toISOString(); // raw SQL params: drizzle overrides postgres.js Date serializers
  const [run] = await db.insert(schema.syncRuns).values({ feedId }).returning();
  await db.update(schema.feeds).set({ status: 'syncing', lastSyncAt: runStart }).where(eq(schema.feeds.id, feedId));

  try {
    const res = await safeFetch(feed.sourceUrl, {
      timeoutMs: 10 * 60 * 1000,
      headers: { accept: 'application/xml,text/xml,*/*' },
    });
    if (!res.ok) throw new Error(`Сервер фіду відповів ${res.status} ${res.statusText}`);
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > env.maxFeedBytes) throw new Error('Фід завеликий');

    const hasher = crypto.createHash('sha256');
    const fieldStats = new Map<string, FeedField>();
    let pending: { externalId: string; position: number; title: string; data: ProductData; hash: string }[] = [];
    const seenIds = new Set<string>();
    let position = 0;
    let changed = 0;
    let lastBeat = Date.now();

    const parser = new FeedStreamParser((p) => {
      const pos = position++;
      let ext = productExternalId(p, pos);
      if (seenIds.has(ext)) ext = `${ext}~${pos}`; // duplicate ids in source
      seenIds.add(ext);
      for (const [k, v] of Object.entries(p)) {
        const s = fieldStats.get(k);
        const val = Array.isArray(v) ? v[0] : v;
        if (s) {
          s.count++;
          if (!s.sample && val) s.sample = val.slice(0, 200);
        } else fieldStats.set(k, { key: k, count: 1, sample: (val ?? '').slice(0, 200) });
      }
      pending.push({ externalId: ext, position: pos, title: productTitle(p), data: p, hash: hashData(p) });
    });

    const flush = async () => {
      if (!pending.length) return;
      const rows = pending;
      pending = [];
      const res = await sql`
        insert into products ${sql(
          rows.map((r) => ({
            feed_id: feedId,
            external_id: r.externalId,
            position: r.position,
            title: r.title,
            data: JSON.stringify(r.data),
            hash: r.hash,
            seen_at: runIso,
            updated_at: runIso,
          })),
        )}
        on conflict (feed_id, external_id) do update set
          position = excluded.position,
          title = excluded.title,
          data = case when products.hash = excluded.hash then products.data else excluded.data end,
          updated_at = case when products.hash = excluded.hash then products.updated_at else excluded.updated_at end,
          hash = excluded.hash,
          seen_at = excluded.seen_at
        returning (xmax = 0) as inserted, updated_at = ${runIso}::timestamptz as touched`;
      changed += res.filter((r: any) => r.touched).length;
      if (Date.now() - lastBeat > 30000) {
        lastBeat = Date.now();
        await opts.heartbeat?.();
      }
    };

    let bytes = 0;
    const decoder = new TextDecoder('utf-8');
    for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
      bytes += chunk.length;
      if (bytes > env.maxFeedBytes) throw new Error('Фід завеликий');
      hasher.update(chunk);
      parser.write(decoder.decode(chunk, { stream: true }));
      if (pending.length >= BATCH) await flush();
    }
    parser.write(decoder.decode());
    parser.end();
    await flush();

    const sourceHash = hasher.digest('hex');
    if (parser.items === 0) throw new Error('У фіді не знайдено жодного товару (item / entry / offer)');

    const removed = await sql`delete from products where feed_id = ${feedId} and seen_at < ${runIso}::timestamptz returning id`;
    const fields = [...fieldStats.values()].sort((a, b) => b.count - a.count);
    const stats = { products: parser.items, changed, removed: removed.length, bytes, ms: Date.now() - started };

    await db
      .update(schema.feeds)
      .set({
        status: 'ok',
        format: parser.format,
        lastError: null,
        lastSuccessAt: new Date(),
        productCount: parser.items,
        fields,
        sourceHash,
      })
      .where(eq(schema.feeds.id, feedId));
    await db
      .update(schema.syncRuns)
      .set({ status: changed || removed.length ? 'ok' : 'unchanged', finishedAt: new Date(), stats })
      .where(eq(schema.syncRuns.id, run.id));

    // re-render every active, published design of this feed when anything changed
    // (also daily even when unchanged, so sale date windows are re-evaluated)
    const designs = await db
      .select({ id: schema.designs.id, renderStats: schema.designs.renderStats })
      .from(schema.designs)
      .where(and(eq(schema.designs.feedId, feedId), eq(schema.designs.active, true), dsql`${schema.designs.published} is not null`));
    for (const d of designs) {
      const lastAt = d.renderStats?.at ? Date.parse(d.renderStats.at) : 0;
      if (opts.force || changed || removed.length || Date.now() - lastAt > 23 * 3600 * 1000) {
        await queueRender(d.id);
      }
    }
    log.info({ feedId, ...stats }, 'feed synced');
    return stats;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(schema.feeds).set({ status: 'error', lastError: msg }).where(eq(schema.feeds.id, feedId));
    await db
      .update(schema.syncRuns)
      .set({ status: 'error', finishedAt: new Date(), error: msg })
      .where(eq(schema.syncRuns.id, run.id));
    throw e;
  }
}

export async function queueRender(designId: string, priority = 5) {
  await db.update(schema.designs).set({ renderStatus: 'queued' }).where(eq(schema.designs.id, designId));
  await enqueue('render-design', { designId }, { dedupeKey: `render:${designId}`, priority });
}

export async function queueSync(feedId: string, priority = 5, force = false) {
  await db.update(schema.feeds).set({ status: 'queued' }).where(eq(schema.feeds.id, feedId));
  await enqueue('sync-feed', { feedId, force }, { dedupeKey: `sync:${feedId}`, priority });
}

/** Called by the worker scheduler: queue feeds whose time has come. */
export async function scheduleDueFeeds() {
  const due = await sql<{ id: string }[]>`
    update feeds set next_sync_at = now() + make_interval(mins => interval_minutes)
    where enabled and next_sync_at <= now()
    returning id`;
  for (const f of due) await queueSync(f.id);
  return due.length;
}
