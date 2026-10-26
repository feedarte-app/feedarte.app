import crypto from 'node:crypto';
import { db, schema } from '../db';
import * as storage from '../storage';
import { FONTS } from '../../shared/fonts';
import { getSetting } from '../auth';

/** Store a generated image as a project asset (visible in the editor's "Фото" tab). */
export async function saveAsset(projectId: string, name: string, buf: Buffer, ext: 'png' | 'jpg' = 'png'): Promise<string> {
  const key = `a/${crypto.randomUUID()}.${ext}`;
  await storage.put(key, buf);
  await db.insert(schema.assets).values({
    projectId,
    name: name.slice(0, 200) || 'image',
    key,
    mime: ext === 'png' ? 'image/png' : 'image/jpeg',
    size: buf.length,
  });
  return `/${key}`;
}

const FAMILY_ALIASES: Record<string, string> = {
  poppins: 'Montserrat',
  'sf pro': 'Inter',
  'sf pro display': 'Inter',
  'sf pro text': 'Inter',
  helvetica: 'Inter',
  'helvetica neue': 'Inter',
  arial: 'Inter',
  'gilroy': 'Manrope',
  'proxima nova': 'Montserrat',
  'gotham': 'Montserrat',
  'futura': 'Montserrat',
  'circe': 'Manrope',
  'tt norms': 'Manrope',
  'graphik': 'Inter',
  'dm sans': 'Manrope',
  'plus jakarta sans': 'Manrope',
  'bebas neue': 'Oswald',
  'anton': 'Oswald',
  'playfair': 'Playfair Display',
  'cormorant': 'Playfair Display',
  'cormorant garamond': 'Playfair Display',
  'georgia': 'Lora',
  'times new roman': 'Lora',
  'pt sans': 'Open Sans',
  'pt serif': 'Lora',
  'noto sans': 'Open Sans',
  'source sans pro': 'Open Sans',
  'lato': 'Open Sans',
  'ubuntu': 'Rubik',
  'roboto flex': 'Roboto',
  'roboto slab': 'Lora',
};

/** Map any font family to one of the bundled fonts. Returns [family, substituted?]. */
export function matchFont(family: string | undefined): [string, boolean] {
  if (!family) return ['Inter', false];
  const f = family.trim();
  const exact = FONTS.find((x) => x.family.toLowerCase() === f.toLowerCase());
  if (exact) return [exact.family, false];
  const alias = FAMILY_ALIASES[f.toLowerCase()];
  if (alias) return [alias, true];
  const starts = FONTS.find((x) => f.toLowerCase().startsWith(x.family.toLowerCase()));
  if (starts) return [starts.family, false];
  if (/serif|garamond|didot|bodoni|times/i.test(f)) return ['Playfair Display', true];
  if (/condensed|narrow|compressed/i.test(f)) return ['Roboto Condensed', true];
  return ['Inter', true];
}

export function toHex(c: { r: number; g: number; b: number; a?: number }, opacity = 1): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  const a = (c.a ?? 1) * opacity;
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${a < 0.999 ? h(a) : ''}`.toUpperCase();
}

const PRICE_RE = /^\s*(?:[₴$€]\s*)?\d[\d\s .,]*\s*(?:грн\.?|uah|₴|\$|€|usd|eur|руб\.?)?\s*$/i;
const PCT_RE = /^\s*[-−–]?\s*\d{1,2}\s*%\s*$/;

/** Guess a feed-variable template for a piece of static design text. */
export function guessBinding(text: string, layerName: string, strikethrough: boolean): { template: string; bound: boolean } {
  const t = text.trim();
  if (/\{\{.+\}\}/.test(t)) return { template: t, bound: true };
  const nameTok = layerName.match(/\{\{\s*([^}]+?)\s*\}\}/);
  if (nameTok) return { template: `{{${nameTok[1]}}}`, bound: true };
  const n = layerName.toLowerCase();
  if (PCT_RE.test(t) || /discount|знижк/.test(n)) {
    if (PCT_RE.test(t)) return { template: t.replace(/\d{1,2}/, '{{discount_percent}}'), bound: true };
  }
  if ((PRICE_RE.test(t) && /\d{2,}/.test(t)) || /price|ціна|цена/.test(n)) {
    if (strikethrough || /old|стар/.test(n)) return { template: '{{old_price_fmt}}', bound: true };
    return { template: '{{current_price_fmt}}', bound: true };
  }
  if (/^(title|name|назва|название)$/.test(n)) return { template: '{{title}}', bound: true };
  if (/^(brand|бренд|vendor)$/.test(n)) return { template: '{{brand|upper}}', bound: t === t.toUpperCase() };
  if (/^(description|опис)$/.test(n)) return { template: '{{description}}', bound: true };
  return { template: t, bound: false };
}

export async function getIntegrationKeys() {
  return {
    figmaToken: await getSetting<string>('figmaToken', ''),
    anthropicKey: await getSetting<string>('anthropicKey', ''),
  };
}

export class ImportError extends Error {
  statusCode = 400;
}
