// Combined feed: one catalog item per product (original id → pixel matching stays intact) carrying
// several Feedarte designs as tagged images, so Meta can pick 4:5 for Feed and 9:16 for Stories/Reels
// ("Adapt to placement"). Written as CSV because Meta documents the nested image[n].url / image[n].tag[n]
// columns only for CSV feeds.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient as sql } from '../db';
import { env } from '../env';
import * as storage from '../storage';
import type { ProductData } from '../../shared/types';
import { DEFAULT_OUTPUT } from '../db/schema';
import { log } from '../log';

/** externalId → rendered image url (null: item included with its original photo) */
export type ImageMap = Record<string, string | null>;

const mapsDir = path.join(env.dataDir, 'maps');
const mapPath = (designId: string) => path.join(mapsDir, `${designId}.json`);

export async function saveImageMap(designId: string, map: ImageMap) {
  await fsp.mkdir(mapsDir, { recursive: true });
  const tmp = `${mapPath(designId)}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(map));
  await fsp.rename(tmp, mapPath(designId));
}

export async function loadImageMap(designId: string): Promise<ImageMap | null> {
  try {
    return JSON.parse(await fsp.readFile(mapPath(designId), 'utf8'));
  } catch {
    return null;
  }
}

export async function removeImageMap(designId: string) {
  await fsp.rm(mapPath(designId), { force: true });
}

export const ROLE_TAGS: Record<'9_16' | '4_5', string[]> = {
  '9_16': ['STORY_PREFERRED', 'REELS_PREFERRED', 'ASPECT_RATIO_9_16_PREFERRED'],
  '4_5': ['ASPECT_RATIO_4_5_PREFERRED'],
};
const FORMAT_ROLE: Record<string, '9_16' | '4_5' | undefined> = { portrait: '4_5', story: '9_16' };

// plain (non-nested) catalog fields copied to the CSV, in this order
const FIELDS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'sale_price_effective_date', 'link', 'mobile_link',
  'brand', 'google_product_category', 'fb_product_category', 'product_type', 'item_group_id', 'color', 'size', 'gender', 'age_group',
  'material', 'pattern', 'gtin', 'mpn', 'quantity_to_sell_on_facebook', 'inventory', 'status', 'visibility',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
  'custom_number_0', 'custom_number_1', 'custom_number_2', 'custom_number_3', 'custom_number_4', 'product_tags', 'unit_price',
];

const cell = (v: string) => (/[",\n\r]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);
const arr = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const first = (v: string | string[] | undefined) => arr(v)[0] ?? '';

/** Re-write the combined CSV of every design in `feedId` that is (or uses) `changedDesignId`. */
export async function refreshCombined(feedId: string, changedDesignId: string) {
  const designs = await db.select().from(schema.designs).where(eq(schema.designs.feedId, feedId));
  for (const d of designs) {
    const out = { ...DEFAULT_OUTPUT, ...(d.output ?? {}) };
    const extras = out.extras ?? [];
    if (!extras.length) {
      await storage.remove(`feeds/${d.publicToken}.csv`).catch(() => {});
      continue;
    }
    if (d.id !== changedDesignId && !extras.some((x) => x.designId === changedDesignId)) continue;
    try {
      const n = await writeCombined(feedId, d, extras, out.keepOriginalAsAdditional);
      log.info({ designId: d.id, items: n }, 'combined feed written');
    } catch (e) {
      log.error({ err: e, designId: d.id }, 'combined feed failed');
    }
  }
}

async function writeCombined(
  feedId: string,
  primary: typeof schema.designs.$inferSelect,
  extras: { designId: string; role: '9_16' | '4_5' }[],
  keepOriginal: boolean,
): Promise<number> {
  const main = await loadImageMap(primary.id);
  if (!main) return 0;
  const extraMaps: { tags: string[]; map: ImageMap }[] = [];
  for (const x of extras) {
    const m = await loadImageMap(x.designId);
    if (m) extraMaps.push({ tags: ROLE_TAGS[x.role], map: m });
  }
  const mainTags = FORMAT_ROLE[primary.formatId] ? ROLE_TAGS[FORMAT_ROLE[primary.formatId]!] : [];

  // pass 1: rows in memory (feeds are at most a few tens of thousands of items)
  type Row = { d: ProductData; images: { url: string; tags: string[] }[]; extra: string[]; main: string };
  const rows: Row[] = [];
  const used = new Set<string>();
  let lastId = 0;
  for (;;) {
    const page = await sql<{ id: number; data: ProductData }[]>`
      select id, data from products where feed_id = ${feedId} and id > ${lastId} order by id limit 1000`;
    if (!page.length) break;
    lastId = page[page.length - 1].id;
    for (const p of page) {
      const ext = first(p.data['id']);
      if (!ext || !(ext in main)) continue;
      const original = arr(p.data['image_link']);
      const additional = arr(p.data['additional_image_link']);
      const mine = main[ext];
      const mainUrl = mine ?? original[0] ?? '';
      if (!mainUrl) continue;
      const images: { url: string; tags: string[] }[] = [{ url: mainUrl, tags: mine ? mainTags : [] }];
      for (const x of extraMaps) {
        const u = x.map[ext];
        if (u) images.push({ url: u, tags: x.tags });
      }
      // other designs go first in additional_image_link, so in Meta image templates "Image number" 1, 2… points at them
      const extra = [...images.slice(1).map((i) => i.url), ...(mine && keepOriginal ? [...original, ...additional] : additional)].slice(0, 20);
      for (const f of FIELDS) if (first(p.data[f])) used.add(f);
      rows.push({ d: p.data, images, extra, main: mainUrl });
    }
  }

  const cols = FIELDS.filter((f) => used.has(f));
  const maxImages = Math.max(1, ...rows.map((r) => r.images.length));
  const maxTags = Object.values(ROLE_TAGS).reduce((m, t) => Math.max(m, t.length), 1);
  const header = [...cols, 'image_link', 'additional_image_link'];
  for (let i = 0; i < maxImages; i++) {
    header.push(`image[${i}].url`);
    for (let t = 0; t < maxTags; t++) header.push(`image[${i}].tag[${t}]`);
  }
  const lines = [header.join(',')];
  for (const r of rows) {
    const vals = cols.map((c) => first(r.d[c]));
    vals.push(r.main, r.extra.join(','));
    for (let i = 0; i < maxImages; i++) {
      const im = r.images[i];
      vals.push(im?.url ?? '');
      for (let t = 0; t < maxTags; t++) vals.push(im?.tags[t] ?? '');
    }
    lines.push(vals.map(cell).join(','));
  }
  await storage.put(`feeds/${primary.publicToken}.csv`, lines.join('\n') + '\n');
  return rows.length;
}
