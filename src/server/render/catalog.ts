// "Meta catalog": one feed link with several Feedarte designs per product.
//
// Every product keeps its original id (pixel matching stays intact) and carries the designs as numbered
// images. Each "set" (slot N) owns two fixed positions: feed image = 2·(N−1), story image = 2·(N−1)+1.
// In Meta Commerce Manager an image template picks a design by "Image number", and the template is chosen
// per ad — so one catalog serves many designs. Set 1 is also tagged for placements, so without any
// template Meta's "Image touch-ups" shows its 4:5 in Feed and its 9:16 in Stories.
// Positions never shift when sets are added/removed: empty positions repeat the main image.
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient as sql } from '../db';
import * as storage from '../storage';
import type { ProductData } from '../../shared/types';
import type { MetaCatalog, MetaCatalogSet } from '../db/schema';
import { loadImageMap, ROLE_TAGS, type ImageMap } from './combined';
import { queueRender } from '../feed/sync';
import { log } from '../log';
import { cleanInstagram, directUrl, validInstagram } from '../routes/go';

export const MAX_SETS = 9;
export const feedImageNumber = (slot: number) => 2 * (slot - 1);
export const storyImageNumber = (slot: number) => 2 * (slot - 1) + 1;

const FIELDS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'sale_price_effective_date', 'link', 'mobile_link',
  'brand', 'google_product_category', 'fb_product_category', 'product_type', 'item_group_id', 'color', 'size', 'gender', 'age_group',
  'material', 'pattern', 'gtin', 'mpn', 'quantity_to_sell_on_facebook', 'inventory', 'status', 'visibility',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
  'custom_number_0', 'custom_number_1', 'custom_number_2', 'custom_number_3', 'custom_number_4', 'product_tags', 'unit_price',
];

const cell = (v: string) => (/[",\n\r]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);
const arr = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const first = (v: string | string[] | undefined) => (arr(v)[0] ?? '').trim();
const inStock = (d: ProductData) => /^(in[ _]?stock|available|preorder|pre[ _]order)$/i.test(first(d['availability']));

export const catalogKey = (token: string) => `feeds/${token}.csv`;

/** designs referenced by the catalog */
export function catalogDesignIds(c: MetaCatalog | null | undefined): string[] {
  if (!c?.enabled) return [];
  return [...new Set(c.sets.flatMap((s) => [s.feedDesignId, s.storyDesignId]).filter((x): x is string => !!x))];
}

/** queue renders for designs that have never produced an image map */
export async function ensureCatalogMaps(c: MetaCatalog) {
  for (const id of catalogDesignIds(c)) if (!(await loadImageMap(id))) await queueRender(id, 2);
}

/** Rebuild the catalog of `feedId` if it uses `designId` (or always, when designId is null). */
export async function refreshCatalog(feedId: string, designId: string | null) {
  const [feed] = await db.select().from(schema.feeds).where(eq(schema.feeds.id, feedId));
  const c = feed?.metaCatalog;
  if (!feed || !c?.enabled || !feed.catalogToken) return;
  if (designId && !catalogDesignIds(c).includes(designId)) return;
  let lastBuild: MetaCatalog['lastBuild'];
  try {
    const r = await buildCatalog(feedId, feed.catalogToken, c);
    lastBuild = { at: new Date().toISOString(), items: r.items, missing: r.missing, error: null };
    log.info({ feedId, ...r }, 'meta catalog written');
  } catch (e) {
    lastBuild = { at: new Date().toISOString(), items: 0, error: e instanceof Error ? e.message : String(e) };
    log.error({ err: e, feedId }, 'meta catalog failed');
  }
  const [cur] = await db.select({ metaCatalog: schema.feeds.metaCatalog }).from(schema.feeds).where(eq(schema.feeds.id, feedId));
  if (cur?.metaCatalog) await db.update(schema.feeds).set({ metaCatalog: { ...cur.metaCatalog, lastBuild } }).where(eq(schema.feeds.id, feedId));
}

async function buildCatalog(feedId: string, token: string, c: MetaCatalog): Promise<{ items: number; missing: string[] }> {
  const sets = [...c.sets].sort((a, b) => a.slot - b.slot);
  const maps = new Map<string, ImageMap>();
  const missing: string[] = [];
  for (const id of catalogDesignIds(c)) {
    const m = await loadImageMap(id);
    if (m) maps.set(id, m);
    else missing.push(id);
  }
  // items = products of the first set that has a feed design (its filter / mode decide what's in the catalog)
  const base = sets.find((s) => s.feedDesignId && maps.has(s.feedDesignId));
  if (!base) throw new Error('Немає жодного відрендереного дизайну для стрічки — опублікуйте дизайн і зачекайте рендер');
  const baseMap = maps.get(base.feedDesignId!)!;
  const maxSlot = Math.max(...sets.map((s) => s.slot));
  const [proj] = await sql<{ instagram: string | null }[]>`select p.instagram from projects p join feeds f on f.project_id = p.id where f.id = ${feedId}`;
  const toDirect = c.clickTarget === 'direct' && validInstagram(cleanInstagram(proj?.instagram));
  const bySlot = new Map<number, MetaCatalogSet>(sets.map((s) => [s.slot, s]));

  type Row = { d: ProductData; images: { url: string; tags: string[] }[]; originals: string[] };
  const rows: Row[] = [];
  const used = new Set<string>();
  const groupBest = new Map<string, { i: number; stock: boolean }>();
  let lastId = 0;
  for (;;) {
    const page = await sql<{ id: number; data: ProductData }[]>`
      select id, data from products where feed_id = ${feedId} and id > ${lastId} order by id limit 1000`;
    if (!page.length) break;
    lastId = page[page.length - 1].id;
    for (const p of page) {
      const ext = first(p.data['id']);
      if (!ext || !(ext in baseMap)) continue;
      const originals = [...arr(p.data['image_link']), ...arr(p.data['additional_image_link'])];
      const main = baseMap[ext] ?? originals[0];
      if (!main) continue;
      const images: { url: string; tags: string[] }[] = [];
      for (let slot = 1; slot <= maxSlot; slot++) {
        const s = bySlot.get(slot);
        const feedUrl = (s?.feedDesignId && maps.get(s.feedDesignId)?.[ext]) || main;
        const storyUrl = (s?.storyDesignId && maps.get(s.storyDesignId)?.[ext]) || feedUrl;
        const tagged = slot === base.slot;
        images.push({ url: feedUrl, tags: tagged && s?.feedDesignId ? ROLE_TAGS['4_5'] : [] });
        images.push({ url: storyUrl, tags: tagged && s?.storyDesignId ? ROLE_TAGS['9_16'] : [] });
      }
      for (const f of FIELDS) if (first(p.data[f])) used.add(f);
      const row: Row = { d: p.data, images, originals };
      if (c.variants === 'one_per_group' && first(p.data['item_group_id'])) {
        const key = `${first(p.data['item_group_id'])}|${first(p.data['color']).toLowerCase()}`;
        const stock = inStock(p.data);
        const cur = groupBest.get(key);
        if (!cur) {
          groupBest.set(key, { i: rows.length, stock });
          rows.push(row);
        } else if (stock && !cur.stock) {
          rows[cur.i] = row;
          cur.stock = true;
        }
        continue;
      }
      rows.push(row);
    }
  }

  // Meta: image_link + up to 20 additional images
  const nImages = Math.min(21, 2 * maxSlot);
  const maxTags = Math.max(...Object.values(ROLE_TAGS).map((t) => t.length));
  const cols = FIELDS.filter((f) => used.has(f));
  const header = [...cols, 'image_link', 'additional_image_link'];
  for (let i = 0; i < nImages; i++) {
    header.push(`image[${i}].url`);
    for (let t = 0; t < maxTags; t++) header.push(`image[${i}].tag[${t}]`);
  }
  const lines = [header.join(',')];
  for (const r of rows) {
    const imgs = r.images.slice(0, nImages);
    const extra = [...imgs.slice(1).map((i) => i.url), ...r.originals].slice(0, 20);
    const ext = first(r.d['id']);
    const vals = cols.map((c2) => (toDirect && (c2 === 'link' || c2 === 'mobile_link') ? directUrl(token, ext) : first(r.d[c2])));
    vals.push(imgs[0].url, extra.join(','));
    for (let i = 0; i < nImages; i++) {
      vals.push(imgs[i]?.url ?? '');
      for (let t = 0; t < maxTags; t++) vals.push(imgs[i]?.tags[t] ?? '');
    }
    lines.push(vals.map(cell).join(','));
  }
  await storage.put(catalogKey(token), lines.join('\n') + '\n');
  return { items: rows.length, missing };
}
