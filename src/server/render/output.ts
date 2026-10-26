// Writes the output catalog feed (Google/Meta RSS 2.0 XML — accepted by Meta and TikTok Catalogs).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import type { ProductData } from '../../shared/types';
import crypto from 'node:crypto';
import { publicDir } from '../storage';
import { env } from '../env';

export interface OutputItem {
  data: ProductData;
  image: string | null; // our rendered image url, null → keep original
  skip: boolean;
}

// Fields from Meta / TikTok / Google catalog specs that we pass through.
const PASS = new Set([
  'id', 'title', 'description', 'rich_text_description', 'availability', 'condition', 'price', 'sale_price',
  'sale_price_effective_date', 'link', 'mobile_link', 'brand', 'google_product_category', 'fb_product_category',
  'product_type', 'item_group_id', 'color', 'size', 'gender', 'age_group', 'material', 'pattern', 'gtin', 'mpn',
  'shipping', 'shipping_weight', 'quantity_to_sell_on_facebook', 'inventory', 'status', 'visibility',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
  'custom_number_0', 'custom_number_1', 'custom_number_2', 'custom_number_3', 'custom_number_4',
  'product_tags', 'video', 'sku_id', 'unit_price', 'expiration_date', 'size_system', 'size_type',
  'additional_variant_attribute', 'return_policy_info', 'origin_country', 'importer_name', 'manufacturer_info',
  'ios_url', 'android_url', 'ios_app_store_id', 'android_package',
]);

function esc(s: string) {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function arr(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function itemXml(it: OutputItem, keepOriginal: boolean): string {
  const d = it.data;
  const parts: string[] = ['<item>'];
  const nested = new Map<string, [string, string][]>();
  for (const [k, v] of Object.entries(d)) {
    const dot = k.indexOf('.');
    if (dot > 0) {
      const root = k.slice(0, dot);
      const leaf = k.slice(dot + 1);
      if (PASS.has(root) && /^[A-Za-z_][\w-]*$/.test(leaf)) {
        const list = nested.get(root) ?? [];
        list.push([leaf, arr(v)[0]]);
        nested.set(root, list);
      }
      continue;
    }
    if (!PASS.has(k)) continue;
    for (const val of arr(v)) parts.push(`<g:${k}>${esc(val)}</g:${k}>`);
  }
  for (const [root, leaves] of nested) {
    parts.push(`<g:${root}>${leaves.map(([l, v]) => `<g:${l}>${esc(v)}</g:${l}>`).join('')}</g:${root}>`);
  }
  const original = arr(d['image_link']);
  const additional = arr(d['additional_image_link']);
  if (it.image) {
    parts.push(`<g:image_link>${esc(it.image)}</g:image_link>`);
    const extra = keepOriginal ? [...original, ...additional] : additional;
    for (const a of extra.slice(0, 20)) parts.push(`<g:additional_image_link>${esc(a)}</g:additional_image_link>`);
  } else {
    for (const o of original.slice(0, 1)) parts.push(`<g:image_link>${esc(o)}</g:image_link>`);
    for (const a of additional.slice(0, 20)) parts.push(`<g:additional_image_link>${esc(a)}</g:additional_image_link>`);
  }
  parts.push('</item>');
  return parts.join('');
}

export class OutputWriter {
  private stream: fs.WriteStream;
  private tmp: string;
  private final: string;
  private err: Error | null = null;
  count = 0;

  constructor(token: string, title: string, private keepOriginal: boolean) {
    this.final = path.join(publicDir, 'feeds', `${token}.xml`);
    this.tmp = `${this.final}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.mkdirSync(path.dirname(this.final), { recursive: true });
    this.stream = fs.createWriteStream(this.tmp);
    this.stream.on('error', (e) => (this.err = e));
    this.stream.write(
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel>\n<title>${esc(title)}</title>\n<link>${esc(env.publicUrl)}</link>\n<description>${esc(title)}</description>\n`,
    );
  }

  async write(items: OutputItem[]) {
    if (this.err) throw this.err;
    for (const it of items) {
      if (it.skip) continue;
      this.count++;
      if (!this.stream.write(itemXml(it, this.keepOriginal) + '\n')) await Promise.race([once(this.stream, 'drain'), once(this.stream, 'error')]);
      if (this.err) throw this.err;
    }
  }

  async close() {
    if (this.err) throw this.err;
    this.stream.end('</channel>\n</rss>\n');
    await Promise.race([once(this.stream, 'finish'), once(this.stream, 'error')]);
    if (this.err) throw this.err;
    await fsp.rename(this.tmp, this.final);
  }

  async abort() {
    this.stream.destroy();
    await fsp.rm(this.tmp, { force: true });
  }
}
