import type { Condition, ConditionRule, FormatSettings, ProductData } from './types';
import { DEFAULT_FORMAT } from './types';

export interface Money {
  value: number;
  currency: string;
}

const CURRENCY_RE = /[A-Z]{3}/;

export function parseMoney(raw: string | undefined | null): Money | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const cur = s.match(CURRENCY_RE)?.[0] ?? '';
  let num = s.replace(CURRENCY_RE, '').replace(/[^\d.,-]/g, '');
  if (!num) return null;
  // "1.170,50" or "1,170.50" or "1170,5"
  const lastDot = num.lastIndexOf('.');
  const lastComma = num.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    num = num.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    const parts = num.split(',');
    num = parts.length === 2 && parts[1].length !== 3 ? parts.join('.') : parts.join('');
  } else if (lastDot >= 0) {
    const parts = num.split('.');
    if (parts.length > 2) num = parts.join('');
  }
  const value = Number(num);
  if (!Number.isFinite(value)) return null;
  return { value, currency: cur };
}

export function formatNumber(value: number, f: FormatSettings): string {
  const decimals = f.decimals > 0 ? f.decimals : Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2;
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, f.thousandSep);
  return (value < 0 ? '-' : '') + grouped + (frac ? f.decimalSep + frac : '');
}

export function formatMoney(value: number, f: FormatSettings): string {
  const n = formatNumber(value, f);
  if (!f.currencyLabel) return n;
  return f.currencyPosition === 'before' ? `${f.currencyLabel}${n}` : `${n} ${f.currencyLabel}`;
}

function first(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

function saleActive(p: ProductData, now: number): boolean {
  const range = first(p['sale_price_effective_date']);
  if (!range) return true;
  const [a, b] = range.split('/');
  const start = a ? Date.parse(a) : NaN;
  const end = b ? Date.parse(b) : NaN;
  if (Number.isFinite(start) && now < start) return false;
  if (Number.isFinite(end) && now > end) return false;
  return true;
}

/** Computed (virtual) fields available in templates and conditions. */
export const COMPUTED_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'current_price_fmt', label: 'Поточна ціна', hint: 'Ціна зі знижкою, якщо є, інакше звичайна' },
  { key: 'price_fmt', label: 'Ціна (формат.)', hint: 'Звичайна ціна з валютою' },
  { key: 'sale_price_fmt', label: 'Ціна зі знижкою', hint: 'Порожньо, якщо знижки немає' },
  { key: 'old_price_fmt', label: 'Стара ціна', hint: 'Звичайна ціна, лише якщо є знижка' },
  { key: 'discount_percent', label: 'Знижка, %', hint: 'Число, напр. 30' },
  { key: 'discount_amount_fmt', label: 'Сума знижки', hint: 'Різниця цін з валютою' },
  { key: 'has_discount', label: 'Є знижка', hint: '"1" або порожньо — для умов' },
  { key: 'current_price_value', label: 'Поточна ціна (число)', hint: 'Для умов > <' },
  { key: 'price_value', label: 'Ціна (число)', hint: '' },
  { key: 'sale_price_value', label: 'Ціна зі знижкою (число)', hint: '' },
];

const COMPUTED_KEYS = new Set(COMPUTED_FIELDS.map((f) => f.key));

export class ProductContext {
  readonly p: ProductData;
  readonly f: FormatSettings;
  private computed: Record<string, string> | null = null;
  constructor(p: ProductData, f?: Partial<FormatSettings>, private now = Date.now()) {
    this.p = p;
    this.f = { ...DEFAULT_FORMAT, ...(f ?? {}) };
  }

  private compute(): Record<string, string> {
    if (this.computed) return this.computed;
    const price = parseMoney(first(this.p['price']));
    let sale = parseMoney(first(this.p['sale_price']));
    if (sale && price && (sale.value <= 0 || sale.value >= price.value || !saleActive(this.p, this.now))) sale = null;
    const current = sale ?? price;
    const pct = sale && price && price.value > 0 ? Math.round((1 - sale.value / price.value) * 100) : 0;
    const hasDiscount = !!sale && pct >= (this.f.discountMin ?? 1);
    const c: Record<string, string> = {
      price_value: price ? String(price.value) : '',
      sale_price_value: sale ? String(sale.value) : '',
      current_price_value: current ? String(current.value) : '',
      price_fmt: price ? formatMoney(price.value, this.f) : '',
      sale_price_fmt: sale ? formatMoney(sale.value, this.f) : '',
      current_price_fmt: current ? formatMoney(current.value, this.f) : '',
      old_price_fmt: hasDiscount && price ? formatMoney(price.value, this.f) : '',
      discount_percent: hasDiscount ? String(pct) : '',
      discount_amount_fmt: hasDiscount && price && sale ? formatMoney(price.value - sale.value, this.f) : '',
      has_discount: hasDiscount ? '1' : '',
    };
    this.computed = c;
    return c;
  }

  get(key: string, index = 0): string {
    key = key.trim();
    if (COMPUTED_KEYS.has(key)) return this.compute()[key] ?? '';
    const m = key.match(/^(.*)\[(\d+)\]$/);
    if (m) {
      key = m[1];
      index = Number(m[2]);
    }
    const v = this.p[key];
    if (v == null) return '';
    if (Array.isArray(v)) return v[index] ?? '';
    return index === 0 ? v : '';
  }

  /** Image URLs list for a field: image_link → [main], additional_image_link → all. */
  images(field: string): string[] {
    const v = this.p[field];
    if (v == null) return [];
    return (Array.isArray(v) ? v : [v]).filter(Boolean);
  }
}

// ---------- templates ----------

const TOKEN_RE = /\{\{\s*([^}|]+?)\s*((?:\|[^}]*)?)\}\}/g;

function applyFilter(val: string, name: string, arg: string | undefined, ctx: ProductContext): string {
  switch (name) {
    case 'upper':
      return val.toLocaleUpperCase('uk-UA');
    case 'lower':
      return val.toLocaleLowerCase('uk-UA');
    case 'capitalize':
      return val ? val[0].toLocaleUpperCase('uk-UA') + val.slice(1) : val;
    case 'truncate': {
      const n = Number(arg ?? 40);
      return val.length > n ? val.slice(0, Math.max(0, n - 1)).trimEnd() + '…' : val;
    }
    case 'money': {
      const m = parseMoney(val);
      return m ? formatMoney(m.value, ctx.f) : val;
    }
    case 'number': {
      const m = parseMoney(val);
      return m ? formatNumber(m.value, ctx.f) : val;
    }
    case 'default':
      return val || (arg ?? '');
    case 'strip':
      return val.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    case 'first_word':
      return val.split(/\s+/)[0] ?? '';
    case 'replace': {
      const [a, b = ''] = (arg ?? '').split('=>');
      return a ? val.split(a).join(b) : val;
    }
    default:
      return val;
  }
}

export function renderTemplate(tpl: string, ctx: ProductContext): string {
  return tpl.replace(TOKEN_RE, (_all, key: string, filters: string) => {
    let val = ctx.get(key);
    if (filters) {
      for (const part of filters.split('|').slice(1)) {
        const idx = part.indexOf(':');
        const name = (idx >= 0 ? part.slice(0, idx) : part).trim();
        const arg = idx >= 0 ? part.slice(idx + 1) : undefined;
        val = applyFilter(val, name, arg, ctx);
      }
    }
    return val;
  });
}

export function templateFields(tpl: string): string[] {
  const out: string[] = [];
  for (const m of tpl.matchAll(TOKEN_RE)) out.push(m[1].trim());
  return out;
}

// ---------- conditions ----------

function num(s: string): number | null {
  if (s === '' || s == null) return null;
  const m = parseMoney(s);
  return m ? m.value : null;
}

export function evalRule(rule: ConditionRule, ctx: ProductContext): boolean {
  const v = ctx.get(rule.field);
  const target = (rule.value ?? '').trim();
  const lv = v.toLocaleLowerCase('uk-UA');
  const lt = target.toLocaleLowerCase('uk-UA');
  switch (rule.op) {
    case 'exists':
      return v.trim() !== '';
    case 'not_exists':
      return v.trim() === '';
    case 'eq':
      return lv === lt;
    case 'neq':
      return lv !== lt;
    case 'contains':
      return lv.includes(lt);
    case 'not_contains':
      return !lv.includes(lt);
    case 'starts_with':
      return lv.startsWith(lt);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = num(v);
      const b = num(target);
      if (a == null || b == null) return false;
      return rule.op === 'gt' ? a > b : rule.op === 'gte' ? a >= b : rule.op === 'lt' ? a < b : a <= b;
    }
    default:
      return true;
  }
}

/** Returns true when the element should be visible for this product. */
export function evalCondition(cond: Condition | null | undefined, ctx: ProductContext): boolean {
  if (!cond || !cond.rules?.length) return true;
  const results = cond.rules.map((r) => evalRule(r, ctx));
  const matched = cond.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
  return cond.action === 'hide' ? !matched : matched;
}

export const OPS: { op: Condition['rules'][number]['op']; label: string; needsValue: boolean }[] = [
  { op: 'exists', label: 'Існує', needsValue: false },
  { op: 'not_exists', label: 'Не існує / порожнє', needsValue: false },
  { op: 'eq', label: 'Дорівнює', needsValue: true },
  { op: 'neq', label: 'Не дорівнює', needsValue: true },
  { op: 'contains', label: 'Містить', needsValue: true },
  { op: 'not_contains', label: 'Не містить', needsValue: true },
  { op: 'starts_with', label: 'Починається з', needsValue: true },
  { op: 'gt', label: 'Більше ніж', needsValue: true },
  { op: 'gte', label: 'Більше або дорівнює', needsValue: true },
  { op: 'lt', label: 'Менше ніж', needsValue: true },
  { op: 'lte', label: 'Менше або дорівнює', needsValue: true },
];

/** Normalize a value for logo matching: "Tommy Hilfiger" == "tommy-hilfiger" == "TOMMY HILFIGER®". */
export function normKey(v: string): string {
  return v
    .toLocaleLowerCase('uk-UA')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™©]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}
