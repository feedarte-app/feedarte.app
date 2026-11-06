// Editorial collages and minimal photo stories (inspired by fashion brand stories).
// Main photo = image_link, other shots = additional_image_link[i]. A packshot on white among the
// extra photos melts into the white page (smart fit, "blend") — like a cut-out product.
import type { Condition, DesignDoc, ImageLayer, Layer, ShapeLayer, TextLayer } from './types';
import { DEFAULT_FORMAT } from './types';
import { IF_DISCOUNT, makeImage, makePriceBlock, makeShape, makeText } from './layers';
import type { Niche } from './templates-lib';

type F = 'story' | 'portrait' | 'square';
const SIZE: Record<F, [number, number]> = { story: [1080, 1920], portrait: [1080, 1350], square: [1080, 1080] };

const img = (p: Partial<ImageLayer> & { pad?: number; mode?: 'card' | 'blend' }): ImageLayer => {
  const { pad = 0, mode = 'blend', ...rest } = p;
  return makeImage({ name: 'Фото товару', fit: 'smart', smart: { pad, bg: mode }, ...rest });
};
const shot = (i: number, p: Partial<ImageLayer> & { pad?: number; mode?: 'card' | 'blend' }) =>
  img({ name: `Фото ${i + 2}`, source: { kind: 'field', field: 'additional_image_link', index: i }, ...p });
const text = (p: Partial<TextLayer>) => makeText({ hideIfEmpty: true, ...p });
const shape = (p: Partial<ShapeLayer>) => makeShape(p);
const atLeast = (n: number): Condition => ({ action: 'show', mode: 'all', rules: [{ field: 'image_count', op: 'gte', value: String(n) }] });
const only = (n: number): Condition => ({ action: 'show', mode: 'all', rules: [{ field: 'image_count', op: 'gte', value: String(n) }, { field: 'image_count', op: 'lt', value: String(n + 1) }] });
const below = (n: number): Condition => ({ action: 'show', mode: 'all', rules: [{ field: 'image_count', op: 'lt', value: String(n) }] });

/** brand logo from the project's logo library; without a logo — the brand name in a script face */
const logo = (box: { x: number; y: number; w: number; h: number }, color = '#1A1A1A', align: 'left' | 'center' | 'right' = 'left'): ImageLayer =>
  makeImage({
    name: 'Логотип',
    ...box,
    source: { kind: 'map', field: 'brand' },
    fit: 'contain',
    hAlign: align,
    fallback: { mode: 'text', font: 'Great Vibes', weight: 400, color },
  });

const SCRIPT = 'Great Vibes';
const SERIF = 'Playfair Display';
const SANS = 'Inter';
const INK = '#1C1C1C';

// ---------- C1: lookbook grid (4 shots) + title, price, description ----------
function c1(): Layer[] {
  return [
    logo({ x: 50, y: 70, w: 360, h: 90 }),
    // 4+ photos: grid; the last shot (often a packshot) dissolves into the page
    img({ name: 'Фото 1', x: 46, y: 154, w: 510, h: 520, fit: 'cover', condition: atLeast(3) }),
    shot(0, { x: 594, y: 154, w: 436, h: 652, fit: 'cover', condition: atLeast(3) }),
    shot(1, { x: 46, y: 712, w: 514, h: 615, fit: 'cover', condition: atLeast(4) }),
    shot(2, { x: 560, y: 800, w: 480, h: 610, pad: 2, condition: atLeast(4) }),
    // exactly 3: the third photo takes the whole lower row
    shot(1, { name: 'Фото 3 (широке)', x: 46, y: 712, w: 988, h: 690, fit: 'cover', condition: only(3) }),
    // exactly 2: two tall columns
    img({ name: 'Фото 1 (висока)', x: 46, y: 154, w: 510, h: 1250, fit: 'cover', condition: only(2) }),
    shot(0, { name: 'Фото 2 (висока)', x: 584, y: 154, w: 450, h: 1250, fit: 'cover', condition: only(2) }),
    img({ name: 'Фото (якщо одне)', x: 46, y: 154, w: 988, h: 1250, fit: 'cover', condition: below(2) }),
    text({ name: 'Назва', text: '{{title}}', x: 50, y: 1440, w: 760, h: 74, font: SANS, weight: 600, size: 52, color: '#2A2A2A', maxLines: 1, autoFit: true, minSize: 30 }),
    text({ name: 'Підзаголовок', text: '{{brand|lower}} collection', x: 54, y: 1508, w: 600, h: 44, font: SANS, weight: 400, size: 32, color: '#3A3A3A', maxLines: 1 }),
    ...makePriceBlock({ x: 640, y: 1500, w: 390 }, 'row', { font: SANS, size: 32, accent: '#B3261E', color: INK, oldColor: '#8A8A8A', align: 'right' }),
    text({ name: 'Опис', text: '{{description}}', x: 46, y: 1580, w: 980, h: 210, font: SANS, weight: 400, size: 27, color: '#2A2A2A', lineHeight: 125, maxLines: 6, autoFit: true, minSize: 22, vAlign: 'top' }),
  ];
}

// ---------- C2: half page with product details, half full photo ----------
function c2(): Layer[] {
  return [
    img({ name: 'Фото на половину', x: 532, y: 0, w: 548, h: 1920, fit: 'cover' }),
    text({ name: 'Назва (рукописна)', text: '{{title}}', x: 30, y: 180, w: 480, h: 120, font: SCRIPT, weight: 400, size: 86, color: INK, align: 'center', maxLines: 1, autoFit: true, minSize: 44 }),
    text({ name: 'Ціна', text: '{{current_price_fmt}}', x: 30, y: 290, w: 480, h: 44, font: SANS, weight: 700, size: 26, color: INK, align: 'center', maxLines: 1 }),
    text({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 30, y: 330, w: 480, h: 40, font: SANS, weight: 400, size: 24, color: '#8A8A8A', align: 'center', maxLines: 1, decoration: 'line-through' }),
    shot(0, { x: 60, y: 380, w: 420, h: 440, pad: 2, condition: atLeast(2) }),
    logo({ x: 60, y: 900, w: 420, h: 90 }, INK, 'center'),
    text({ name: 'Підзаголовок', text: 'new collection', x: 30, y: 985, w: 480, h: 44, font: SANS, weight: 500, size: 30, color: '#444444', align: 'center', maxLines: 1 }),
    shot(1, { x: 60, y: 1100, w: 420, h: 720, pad: 2, condition: atLeast(3) }),
    text({ name: 'Опис', text: '{{description}}', x: 70, y: 1110, w: 400, h: 400, font: SANS, weight: 400, size: 26, color: '#3A3A3A', align: 'center', lineHeight: 130, maxLines: 9, autoFit: true, minSize: 20, vAlign: 'top', condition: below(3) }),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: 30, y: 120, w: 480, h: 50, font: SANS, weight: 700, size: 26, letterSpacing: 2, color: '#B3261E', align: 'center', maxLines: 1, condition: structuredClone(IF_DISCOUNT) }),
  ];
}

// ---------- C3: three-shot collage, script title, description, logo at the bottom ----------
function c3(): Layer[] {
  return [
    img({ name: 'Фото 1', x: 0, y: 0, w: 533, h: 688, fit: 'cover', condition: atLeast(3) }),
    shot(0, { x: 0, y: 698, w: 533, h: 784, fit: 'cover', condition: atLeast(3) }),
    shot(0, { name: 'Фото 2 (висока)', x: 0, y: 0, w: 533, h: 1482, fit: 'cover', condition: only(2) }),
    shot(1, { x: 545, y: 0, w: 535, h: 1482, fit: 'cover', condition: atLeast(3) }),
    img({ name: 'Фото 1 (велике)', x: 545, y: 0, w: 535, h: 1482, fit: 'cover', condition: below(3) }),
    img({ name: 'Фото (якщо одне)', x: 0, y: 0, w: 1080, h: 1482, fit: 'cover', condition: below(2) }),
    text({ name: 'Назва (рукописна)', text: '{{title}}', x: 56, y: 1500, w: 960, h: 80, font: SERIF, italic: true, weight: 400, size: 56, color: INK, maxLines: 1, autoFit: true, minSize: 32 }),
    ...makePriceBlock({ x: 58, y: 1584, w: 700 }, 'row', { font: SANS, size: 34, accent: '#B3261E', color: INK, oldColor: '#8A8A8A', align: 'left' }),
    text({ name: 'Опис', text: '{{description}}', x: 58, y: 1648, w: 960, h: 150, font: SANS, weight: 400, size: 28, color: '#2A2A2A', lineHeight: 125, maxLines: 4, autoFit: true, minSize: 22, vAlign: 'top' }),
    logo({ x: 390, y: 1810, w: 300, h: 80 }, INK, 'center'),
  ];
}

// ---------- C4: big photo, product shots overlapping a white base, script name ----------
function c4(): Layer[] {
  return [
    img({ name: 'Фото', x: 0, y: 0, w: 1080, h: 1300, fit: 'cover' }),
    shot(0, { x: 300, y: 1120, w: 520, h: 560, pad: 1, condition: atLeast(2) }),
    text({ name: 'Назва (рукописна)', text: '{{title}}', x: 60, y: 1660, w: 640, h: 100, font: SCRIPT, weight: 400, size: 80, color: INK, maxLines: 1, autoFit: true, minSize: 40 }),
    text({ name: 'Ціна', text: '{{current_price_fmt}}', x: 80, y: 1760, w: 500, h: 50, font: SANS, weight: 400, size: 32, color: '#3A3A3A', maxLines: 1 }),
    text({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 330, y: 1762, w: 300, h: 46, font: SANS, weight: 400, size: 28, color: '#9A9A9A', maxLines: 1, decoration: 'line-through' }),
    logo({ x: 760, y: 1700, w: 280, h: 80 }, INK, 'right'),
  ];
}

// ---------- C5: monogram, two shots on top, product + name centred, description ----------
function c5(): Layer[] {
  return [
    shape({ name: 'Плашка лого', x: 470, y: 48, w: 140, h: 140, fill: { color: '#F6F6F6' } }),
    logo({ x: 470, y: 58, w: 140, h: 120 }, INK, 'center'),
    img({ name: 'Фото 1', x: 22, y: 225, w: 507, h: 760, fit: 'cover', condition: atLeast(3) }),
    shot(0, { x: 551, y: 225, w: 507, h: 760, fit: 'cover', condition: atLeast(3) }),
    img({ name: 'Фото 1 (висока)', x: 22, y: 225, w: 507, h: 1180, fit: 'cover', condition: only(2) }),
    shot(0, { name: 'Фото 2 (висока)', x: 551, y: 225, w: 507, h: 1180, fit: 'cover', condition: only(2) }),
    img({ name: 'Фото (якщо одне)', x: 22, y: 225, w: 1036, h: 1180, fit: 'cover', condition: below(2) }),
    shot(1, { x: 300, y: 1010, w: 480, h: 420, pad: 2, condition: atLeast(3) }),
    text({ name: 'Назва', text: '{{title}}', x: 90, y: 1440, w: 900, h: 80, font: SERIF, italic: true, weight: 400, size: 54, color: INK, align: 'center', maxLines: 1, autoFit: true, minSize: 30 }),
    ...makePriceBlock({ x: 90, y: 1520, w: 900 }, 'row', { font: SANS, size: 34, accent: '#B3261E', color: INK, oldColor: '#8A8A8A', align: 'center' }),
    text({ name: 'Опис', text: '{{description}}', x: 120, y: 1610, w: 840, h: 160, font: SANS, weight: 400, size: 27, color: '#444444', align: 'center', lineHeight: 125, maxLines: 4, autoFit: true, minSize: 22, vAlign: 'top' }),
  ];
}

// ---------- minimal: full photo, small text (story, 4:5, 1:1) ----------
function scrimBottom(W: number, H: number, h: number): Layer {
  return shape({ name: 'Затемнення', x: -40, y: H - h, w: W + 80, h: h + 40, fill: { color: '#000000', gradient: { from: '#00000000', to: '#0000008C', angle: 180, smooth: true } } });
}

/** M1: "New Collection" in script, bold product name, price — bottom left */
function m1(f: F): Layer[] {
  const [W, H] = SIZE[f];
  const base = f === 'story' ? H - 560 : H - 330;
  return [
    img({ name: 'Фото', x: 0, y: 0, w: W, h: H, fit: 'cover' }),
    scrimBottom(W, H, f === 'story' ? 900 : 560),
    text({ name: 'Надпис', text: 'New Collection', x: 80, y: base, w: 620, h: 90, font: SCRIPT, weight: 400, size: 72, color: '#FFFFFF', maxLines: 1, shadow: { color: 'rgba(0,0,0,0.25)', blur: 12, x: 0, y: 2 } }),
    text({ name: 'Назва', text: '{{title}}', x: 84, y: base + 82, w: 800, h: 80, font: SANS, weight: 700, size: 60, color: '#FFFFFF', maxLines: 1, autoFit: true, minSize: 34, shadow: { color: 'rgba(0,0,0,0.25)', blur: 12, x: 0, y: 2 } }),
    ...makePriceBlock({ x: 86, y: base + 168, w: 640 }, 'row', { font: SANS, size: 32, accent: '#FFFFFF', color: '#FFFFFF', oldColor: 'rgba(255,255,255,0.7)', align: 'left' }),
  ];
}

/** M2: brand logo on top, quiet italic label with price */
function m2(f: F): Layer[] {
  const [W, H] = SIZE[f];
  const y = f === 'story' ? H - 640 : H - 330;
  return [
    img({ name: 'Фото', x: 0, y: 0, w: W, h: H, fit: 'cover' }),
    shape({ name: 'Затемнення зверху', x: -40, y: -40, w: W + 80, h: 360, fill: { color: '#000000', gradient: { from: '#00000059', to: '#00000000', angle: 180, smooth: true } } }),
    scrimBottom(W, H, f === 'story' ? 900 : 520),
    logo({ x: W / 2 - 180, y: f === 'story' ? 70 : 40, w: 360, h: 90 }, 'rgba(255,255,255,0.85)', 'center'),
    text({ name: 'Назва', text: '{{title}}', x: 90, y, w: 700, h: 64, font: SERIF, italic: true, weight: 400, size: 44, color: '#FFFFFF', maxLines: 2, autoFit: true, minSize: 28, lineHeight: 110, vAlign: 'bottom' }),
    text({ name: 'Ціна', text: '₴ {{current_price_value}}', x: 92, y: y + 70, w: 500, h: 50, font: SANS, weight: 400, size: 34, color: '#FFFFFF', maxLines: 1 }),
    text({ name: 'Стара ціна', text: '₴ {{price_value}}', x: 330, y: y + 74, w: 300, h: 46, font: SANS, weight: 400, size: 28, color: 'rgba(255,255,255,0.7)', maxLines: 1, decoration: 'line-through', condition: structuredClone(IF_DISCOUNT) }),
  ];
}

/** M3: name + price aside, a line of description — like a magazine caption */
function m3(f: F): Layer[] {
  const [W, H] = SIZE[f];
  const y = f === 'story' ? Math.round(H * 0.55) : Math.round(H * 0.6);
  const sh = { color: 'rgba(0,0,0,0.3)', blur: 14, x: 0, y: 2 };
  return [
    img({ name: 'Фото', x: 0, y: 0, w: W, h: H, fit: 'cover' }),
    shape({ name: 'Затемнення зліва', x: -220, y: y - 330, w: 1000, h: 880, fill: { color: '#000000', gradient: { from: '#00000073', to: '#00000000', angle: 0, type: 'radial', smooth: true } } }),
    text({ id: 'm3title', name: 'Назва', text: '{{title}}', x: 68, y, w: 640, h: 46, font: SANS, weight: 700, size: 34, color: '#FFFFFF', maxLines: 1, autoFit: true, minSize: 24, shadow: sh }),
    // the price follows the end of the title with a fixed gap
    text({ name: 'Ціна', text: '{{current_price_fmt}}', x: 500, y: y + 2, w: 300, h: 44, font: SANS, weight: 400, size: 32, color: 'rgba(255,255,255,0.85)', maxLines: 1, shadow: sh, attach: { to: 'm3title', side: 'right', gap: 28 } }),
    text({ name: 'Опис', text: '{{description}}', x: 68, y: y + 70, w: 560, h: 130, font: SANS, weight: 400, size: 30, color: '#FFFFFF', lineHeight: 120, maxLines: 3, autoFit: true, minSize: 22, vAlign: 'top', shadow: sh }),
  ];
}

interface E {
  key: string;
  name: string;
  hint: string;
  niches: Niche[];
  formats: F[];
  layers: (f: F) => Layer[];
  bg?: string;
}

const LIST: E[] = [
  { key: 'c1', name: 'Лукбук-колаж', hint: '4 фото сіткою, назва, ціна й опис з фіду; пекшот на білому «вирізається» в сторінку', niches: ['fashion', 'beauty', 'home'], formats: ['story'], layers: c1 },
  { key: 'c2', name: 'Половина на половину', hint: 'Ліворуч назва рукописом, ціна, пекшот і лого; праворуч фото на всю висоту', niches: ['fashion'], formats: ['story'], layers: c2 },
  { key: 'c3', name: 'Три кадри + опис', hint: 'Колаж з трьох фото, назва курсивом, опис і логотип унизу', niches: ['fashion', 'beauty'], formats: ['story'], layers: c3 },
  { key: 'c4', name: 'Фото + товари внизу', hint: 'Велике фото, ракурси товару заходять на білу основу, рукописна назва', niches: ['fashion'], formats: ['story'], layers: c4 },
  { key: 'c5', name: 'Монограма і два кадри', hint: 'Лого в квадраті, два фото, товар і назва курсивом по центру', niches: ['fashion', 'jewelry', 'beauty'], formats: ['story'], layers: c5 },
  { key: 'm1', name: 'Мінімал: New Collection', hint: 'Фото на весь кадр, рукописне «New Collection», назва й ціна знизу', niches: ['fashion', 'beauty', 'jewelry', 'home', 'sport'], formats: ['story', 'portrait', 'square'], layers: m1 },
  { key: 'm2', name: 'Мінімал: лого й підпис', hint: 'Фото на весь кадр, логотип угорі, тихий підпис курсивом з ціною', niches: ['fashion', 'beauty', 'jewelry', 'home'], formats: ['story', 'portrait', 'square'], layers: m2 },
  { key: 'm3', name: 'Мінімал: підпис з описом', hint: 'Фото на весь кадр, назва, ціна і рядок опису збоку', niches: ['fashion', 'sport', 'home'], formats: ['story', 'portrait', 'square'], layers: m3 },
];

export function editorialTemplates() {
  const out: { id: string; name: string; formatId: F; niches: Niche[]; hint: string; doc: DesignDoc }[] = [];
  for (const e of LIST) {
    for (const f of e.formats) {
      const [W, H] = SIZE[f];
      const layers = e.layers(f);
      const ren = new Map<string, string>();
      layers.forEach((l, i) => {
        ren.set(l.id, `e${i}`);
        l.id = `e${i}`;
      });
      for (const l of layers) if (l.attach) l.attach = { ...l.attach, to: ren.get(l.attach.to) ?? l.attach.to };
      out.push({ id: `ed-${e.key}-${f}`, name: e.name, formatId: f, niches: e.niches, hint: e.hint, doc: { width: W, height: H, background: { color: e.bg ?? '#FFFFFF' }, layers, format: { ...DEFAULT_FORMAT } } });
    }
  }
  return out;
}
