// Streaming XML feed parser: Google/Meta RSS 2.0, Atom, YML (Rozetka/Prom), generic <product>.
import { SaxesParser } from 'saxes';
import type { ProductData } from '../../shared/types';

export type FeedFormat = 'rss' | 'atom' | 'yml' | 'generic';

interface Frame {
  name: string; // local name (no prefix)
  prefix: string;
  attrs: Record<string, string>;
  text: string;
}

const ITEM_TAGS: Record<string, FeedFormat> = { item: 'rss', entry: 'atom', offer: 'yml', product: 'generic' };

function local(qname: string): [string, string] {
  const i = qname.indexOf(':');
  return i >= 0 ? [qname.slice(i + 1), qname.slice(0, i)] : [qname, ''];
}

function add(data: ProductData, key: string, value: string, priority: boolean, owned: Set<string>) {
  if (!value) return;
  const cur = data[key];
  if (cur == null) {
    data[key] = value;
    if (priority) owned.add(key);
    return;
  }
  // namespaced google field wins over a plain field with the same name (atom <id> vs <g:id>)
  if (priority && !owned.has(key)) {
    data[key] = value;
    owned.add(key);
    return;
  }
  if (!priority && owned.has(key)) return;
  data[key] = Array.isArray(cur) ? [...cur, value] : [cur, value];
}

export class FeedStreamParser {
  format: FeedFormat | null = null;
  private parser = new SaxesParser({ xmlns: false, position: false });
  private stack: Frame[] = [];
  private itemDepth = -1;
  private item: ProductData | null = null;
  private owned = new Set<string>();
  private categories = new Map<string, { name: string; parent?: string }>();
  private currency = '';
  items = 0;

  constructor(private onItem: (p: ProductData) => void) {
    this.parser.on('opentag', (t) => {
      const [name, prefix] = local(t.name);
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(t.attributes)) attrs[local(k)[0]] = String(v);
      const frame: Frame = { name, prefix, attrs, text: '' };
      if (this.item == null && ITEM_TAGS[name] && (!this.format || ITEM_TAGS[name] === this.format)) {
        // generic <product> only when nothing else has been detected
        if (name !== 'product' || !this.format) {
          this.format = ITEM_TAGS[name];
          this.item = {};
          this.owned = new Set();
          this.itemDepth = this.stack.length;
          if (this.format === 'yml' || this.format === 'generic') {
            for (const [k, v] of Object.entries(attrs)) add(this.item, k, v, false, this.owned);
          }
        }
      }
      this.stack.push(frame);
    });
    this.parser.on('text', (s) => {
      const top = this.stack[this.stack.length - 1];
      if (top) top.text += s;
    });
    this.parser.on('cdata', (s) => {
      const top = this.stack[this.stack.length - 1];
      if (top) top.text += s;
    });
    this.parser.on('closetag', () => {
      const frame = this.stack.pop()!;
      const depth = this.stack.length;
      if (this.item && depth === this.itemDepth) {
        const p = this.format === 'yml' ? this.normalizeYml(this.item) : this.item;
        this.item = null;
        this.itemDepth = -1;
        this.items++;
        this.onItem(p);
        return;
      }
      if (this.item && depth > this.itemDepth) {
        const text = frame.text.trim();
        // path relative to the item element, e.g. shipping.country
        const path = this.stack
          .slice(this.itemDepth + 1)
          .map((f) => f.name)
          .concat(frame.name);
        let key = path.join('.');
        if (frame.name === 'param' && frame.attrs.name) key = `param.${frame.attrs.name}`;
        if (this.format === 'atom' && frame.name === 'link' && frame.attrs.href && !text) {
          add(this.item, 'link', frame.attrs.href, false, this.owned);
          return;
        }
        // only leaf values (elements with children produce dotted keys)
        if (text) add(this.item, key, text, frame.prefix === 'g', this.owned);
        return;
      }
      // YML shop-level: categories & currency
      if (frame.name === 'category' && frame.attrs.id) {
        this.categories.set(frame.attrs.id, { name: frame.text.trim(), parent: frame.attrs.parentId });
      }
      if (frame.name === 'currency' && frame.attrs.id && !this.currency) this.currency = frame.attrs.id;
    });
  }

  private categoryPath(id: string): string {
    const parts: string[] = [];
    let cur: string | undefined = id;
    let guard = 0;
    while (cur && this.categories.has(cur) && guard++ < 10) {
      const c: { name: string; parent?: string } = this.categories.get(cur)!;
      parts.unshift(c.name);
      cur = c.parent;
    }
    return parts.join(' > ');
  }

  /** Map YML offer fields to Google/Meta names (keeps originals too). */
  private normalizeYml(o: ProductData): ProductData {
    const s = (k: string) => {
      const v = o[k];
      return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
    };
    const out: ProductData = { ...o };
    const cur = s('currencyId') || this.currency || 'UAH';
    const curNorm = cur === 'RUR' ? 'RUB' : cur;
    if (!out.title && s('name')) out.title = s('name');
    if (!out.link && s('url')) out.link = s('url');
    const pics = o['picture'] ? (Array.isArray(o['picture']) ? o['picture'] : [o['picture']]) : [];
    if (!out.image_link && pics[0]) out.image_link = pics[0];
    if (!out.additional_image_link && pics.length > 1) out.additional_image_link = pics.slice(1);
    if (!out.brand && s('vendor')) out.brand = s('vendor');
    if (!out.item_group_id && s('group_id')) out.item_group_id = s('group_id');
    const price = Number(s('price'));
    const old = Number(s('oldprice') || s('old_price'));
    if (Number.isFinite(price) && price > 0) {
      if (Number.isFinite(old) && old > price) {
        out.price = `${old} ${curNorm}`;
        out.sale_price = `${price} ${curNorm}`;
      } else out.price = `${price} ${curNorm}`;
    }
    if (!out.availability) {
      const av = s('available');
      if (av) out.availability = av === 'false' ? 'out of stock' : 'in stock';
    }
    if (!out.product_type && s('categoryId')) out.product_type = this.categoryPath(s('categoryId'));
    if (!out.description && s('description')) out.description = s('description');
    if (!out.condition) out.condition = 'new';
    for (const k of Object.keys(o)) {
      if (k.startsWith('param.')) {
        const n = k.slice(6).toLowerCase();
        if (!out.color && /колір|цвет|color/.test(n)) out.color = s(k);
        if (!out.size && /розмір|размер|size/.test(n)) out.size = s(k);
      }
    }
    return out;
  }

  write(chunk: string) {
    this.parser.write(chunk);
  }

  end() {
    this.parser.close();
  }
}

export function productExternalId(p: ProductData, position: number): string {
  const get = (k: string) => {
    const v = p[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return (get('id') || get('offer_id') || get('sku') || get('link') || `pos-${position}`).slice(0, 200);
}

export function productTitle(p: ProductData): string {
  const v = p['title'] ?? p['name'] ?? '';
  return (Array.isArray(v) ? v[0] : v).slice(0, 300);
}
