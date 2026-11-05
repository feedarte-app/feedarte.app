// Template library: layout concepts × niche themes, generated for 1:1, 4:5 and 9:16.
//
// Principles (from catalog-ads research, see project notes):
//  - the product is the hero: photo gets ~60–70% of the canvas, overlays never cover its centre;
//  - every photo layer uses fit 'smart': lifestyle shots fill the frame, packshots are trimmed and fitted whole;
//  - price is always present; discount elements appear only for discounted products;
//  - 9:16 keeps text and prices out of the top ~260px and bottom ~400px (Stories/Reels/TikTok UI);
//  - each niche has its own palette and type: quiet serif for jewelry, soft pastel for kids, dark tech for gadgets…
import type { DesignDoc, Layer, ShapeLayer, TextLayer, ImageLayer, Fill } from './types';
import { DEFAULT_FORMAT } from './types';
import { IF_DISCOUNT, IF_NO_DISCOUNT, makeIcon, makeImage, makePriceBlock, makeShape, makeText } from './layers';

export type LibFormat = 'square' | 'portrait' | 'story';
export type Niche = 'fashion' | 'jewelry' | 'beauty' | 'home' | 'tech' | 'kids' | 'sport' | 'sale';

export const NICHES: { id: Niche; label: string }[] = [
  { id: 'fashion', label: 'Одяг і взуття' },
  { id: 'jewelry', label: 'Прикраси' },
  { id: 'beauty', label: 'Краса' },
  { id: 'home', label: 'Дім і меблі' },
  { id: 'tech', label: 'Гаджети' },
  { id: 'kids', label: 'Дитячі товари' },
  { id: 'sport', label: 'Спорт' },
  { id: 'sale', label: 'Розпродаж' },
];

interface Theme {
  bg: string;
  surface: string; // cards / panels
  ink: string; // main text
  muted: string; // secondary text, old price
  accent: string; // brand colour of the template
  onAccent: string; // text on accent
  sale: string; // discounted price & badges
  head: string; // headline font
  headWeight: number;
  body: string;
  bodyWeight: number;
}

const SIZES: Record<LibFormat, [number, number]> = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920] };

/** canvas + area where text/prices are safe from platform UI */
interface K {
  f: LibFormat;
  W: number;
  H: number;
  t: number; // safe top
  b: number; // safe bottom
  s: number; // side margin
}
function kit(f: LibFormat): K {
  const [W, H] = SIZES[f];
  if (f === 'story') return { f, W, H, t: 220, b: H - 340, s: 64 };
  return { f, W, H, t: 56, b: H - 56, s: 56 };
}

const photo = (p: Partial<ImageLayer> & { pad?: number; mode?: 'card' | 'blend' }): ImageLayer => {
  const { pad = 7, mode = 'blend', ...rest } = p;
  return makeImage({ name: 'Фото товару', fit: 'smart', smart: { pad, bg: mode }, ...rest });
};
const isDark = (hex: string) => {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
};
/** a white photo background dissolves nicely only into light surfaces */
const modeOn = (surface: string): 'card' | 'blend' => (isDark(surface) ? 'card' : 'blend');
const text = (p: Partial<TextLayer>) => makeText({ hideIfEmpty: true, ...p });
const shape = (p: Partial<ShapeLayer>) => makeShape(p);
const solid = (color: string): Fill => ({ color });

function title(k: K, th: Theme, box: { x: number; y: number; w: number; h: number }, o: Partial<TextLayer> = {}) {
  return text({ name: 'Назва', text: '{{title}}', ...box, font: th.body, weight: Math.max(500, th.bodyWeight), size: k.f === 'story' ? 50 : k.f === 'portrait' ? 46 : 42, minSize: 28, color: th.ink, maxLines: 2, autoFit: true, lineHeight: 118, vAlign: 'top', ...o });
}
function brand(th: Theme, box: { x: number; y: number; w: number; h: number }, o: Partial<TextLayer> = {}) {
  return text({ name: 'Бренд', text: '{{brand|upper}}', ...box, font: th.head, weight: th.headWeight, size: 30, letterSpacing: 3, color: th.muted, maxLines: 1, autoFit: true, minSize: 18, ...o });
}
function price(th: Theme, box: { x: number; y: number; w: number }, variant: 'row' | 'stack', o: { size?: number; align?: 'left' | 'center' | 'right'; color?: string; oldColor?: string; accent?: string; font?: string } = {}) {
  return makePriceBlock(box, variant, { font: o.font ?? th.head, size: o.size ?? 60, accent: o.accent ?? th.sale, color: o.color ?? th.ink, oldColor: o.oldColor ?? th.muted, align: o.align ?? 'left' });
}
function pillBadge(th: Theme, x: number, y: number, o: { color?: string; ink?: string; size?: number; align?: 'left' | 'right' } = {}): Layer[] {
  const size = o.size ?? 40;
  const h = Math.round(size * 1.9);
  const w = Math.round(size * 5.2);
  return [
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: o.align === 'right' ? x - w : x, y, w, h, font: 'Unbounded', weight: 700, size, color: o.ink ?? '#ffffff', align: o.align === 'right' ? 'right' : 'left', autoWidth: true, maxLines: 1, bg: { color: o.color ?? th.sale, radius: h / 2, padX: Math.round(size * 0.7), padY: 0 }, condition: structuredClone(IF_DISCOUNT) }),
  ];
}
function burstBadge(th: Theme, cx: number, cy: number, r: number, o: { color?: string; ink?: string; rotate?: number } = {}): Layer[] {
  return [
    shape({ name: 'Бейдж знижки', shape: 'burst', points: 16, x: cx - r, y: cy - r, w: r * 2, h: r * 2, fill: solid(o.color ?? th.sale), rotation: o.rotate ?? 10, condition: structuredClone(IF_DISCOUNT) }),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: cx - r, y: cy - r, w: r * 2, h: r * 2, font: 'Unbounded', weight: 800, size: Math.round(r * 0.42), color: o.ink ?? '#ffffff', align: 'center', rotation: o.rotate ?? 10, maxLines: 1, autoFit: true }),
  ];
}
function circleBadge(th: Theme, cx: number, cy: number, r: number, o: { color?: string; ink?: string; font?: string } = {}): Layer[] {
  return [
    shape({ name: 'Бейдж знижки', shape: 'ellipse', x: cx - r, y: cy - r, w: r * 2, h: r * 2, fill: solid(o.color ?? th.sale), condition: structuredClone(IF_DISCOUNT) }),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: cx - r, y: cy - r, w: r * 2, h: r * 2, font: o.font ?? th.head, weight: 700, size: Math.round(r * 0.5), color: o.ink ?? '#ffffff', align: 'center', maxLines: 1, autoFit: true }),
  ];
}
/** text area height for title + price under a photo */
const infoH = (k: K) => (k.f === 'square' ? 270 : k.f === 'portrait' ? 320 : 360);

// ======================= layouts =======================

/** 1. Clean card: product on a white rounded card, info below */
function lClean(k: K, th: Theme): Layer[] {
  const ih = infoH(k);
  const cardH = k.b - k.t - ih;
  const L: Layer[] = [
    shape({ name: 'Картка', x: k.s, y: k.t, w: k.W - k.s * 2, h: cardH, radius: 44, fill: solid(th.surface), shadow: { color: 'rgba(30,20,10,0.08)', blur: 40, x: 0, y: 14 } }),
    photo({ x: k.s, y: k.t, w: k.W - k.s * 2, h: cardH, radius: 44, pad: 8 }),
    ...pillBadge(th, k.s + 28, k.t + 28, { size: 34 }),
    brand(th, { x: k.s + 8, y: k.t + cardH + 34, w: 700, h: 40 }, { size: 26 }),
    title(k, th, { x: k.s + 8, y: k.t + cardH + 80, w: k.W - k.s * 2 - 16, h: k.f === 'square' ? 100 : 116 }),
    ...price(th, { x: k.s + 8, y: k.b - (k.f === 'square' ? 84 : 96), w: 640 }, 'row', { size: k.f === 'square' ? 54 : 60 }),
  ];
  return L;
}

/** 2. Full bleed: photo fills the canvas, legible text on a soft scrim */
function lBleed(k: K, th: Theme): Layer[] {
  const scrimH = Math.round(k.H * (k.f === 'story' ? 0.5 : 0.42));
  return [
    photo({ x: 0, y: 0, w: k.W, h: k.H, pad: 12, mode: 'card' }),
    shape({ name: 'Затемнення', x: 0, y: k.H - scrimH, w: k.W, h: scrimH, fill: { color: '#000000', gradient: { from: 'rgba(0,0,0,0)', to: 'rgba(0,0,0,0.62)', angle: 180 } } }),
    text({ name: 'Бренд', text: '{{brand|upper}}', x: k.s, y: k.t, w: 640, h: 64, font: th.head, weight: 700, size: 28, letterSpacing: 4, color: th.ink, autoWidth: true, maxLines: 1, bg: { color: 'rgba(255,255,255,0.92)', radius: 32, padX: 26, padY: 0 } }),
    ...pillBadge(th, k.W - k.s, k.t, { size: 32, align: 'right' }),
    title(k, th, { x: k.s, y: k.b - 230, w: k.W - k.s * 2, h: 120 }, { color: '#ffffff', size: k.f === 'story' ? 50 : 44, vAlign: 'bottom' }),
    ...price(th, { x: k.s, y: k.b - 96, w: 700 }, 'row', { color: '#ffffff', oldColor: 'rgba(255,255,255,0.7)', accent: '#ffffff', size: 64 }),
  ];
}

/** 3. Split: photo panel + coloured info panel (side by side on square, stacked on tall formats) */
function lSplit(k: K, th: Theme): Layer[] {
  if (k.f === 'square') {
    const pw = 620;
    return [
      shape({ name: 'Панель фото', x: 0, y: 0, w: pw, h: k.H, fill: solid(th.surface) }),
      photo({ x: 0, y: 0, w: pw, h: k.H, pad: 9 }),
      shape({ name: 'Кольорова панель', x: pw, y: 0, w: k.W - pw, h: k.H, fill: solid(th.accent) }),
      brand(th, { x: pw + 44, y: 80, w: k.W - pw - 88, h: 44 }, { color: th.onAccent, size: 26 }),
      title(k, th, { x: pw + 44, y: 150, w: k.W - pw - 88, h: 230 }, { color: th.onAccent, font: th.head, weight: th.headWeight, size: 44, maxLines: 4, minSize: 26 }),
      ...price(th, { x: pw + 44, y: 760, w: k.W - pw - 88 }, 'stack', { color: th.onAccent, oldColor: th.onAccent + 'B3', accent: th.onAccent, size: 60 }),
      ...pillBadge(th, pw + 44, 960, { size: 30, color: th.onAccent, ink: th.accent }),
    ];
  }
  const ph = Math.round(k.H * (k.f === 'story' ? 0.6 : 0.64));
  const top = k.f === 'story' ? k.H - ph : 0; // story: info panel at top (inside safe zone), photo fills the bottom
  const panelY = k.f === 'story' ? 0 : ph;
  const panelH = k.H - ph;
  const ty = k.f === 'story' ? k.t : panelY + 50;
  return [
    shape({ name: 'Панель фото', x: 0, y: top, w: k.W, h: ph, fill: solid(th.surface) }),
    photo({ x: 0, y: top, w: k.W, h: ph, pad: 8 }),
    shape({ name: 'Кольорова панель', x: 0, y: panelY, w: k.W, h: panelH, fill: solid(th.accent) }),
    brand(th, { x: k.s, y: ty, w: 700, h: 40 }, { color: th.onAccent, size: 26 }),
    title(k, th, { x: k.s, y: ty + 52, w: k.W - k.s * 2, h: 120 }, { color: th.onAccent, font: th.head, weight: th.headWeight }),
    ...price(th, { x: k.s, y: ty + 190, w: 700 }, 'row', { color: th.onAccent, oldColor: th.onAccent + 'B3', accent: th.onAccent, size: 64 }),
    ...pillBadge(th, k.W - k.s, ty, { size: 32, color: th.onAccent, ink: th.accent, align: 'right' }),
  ];
}

/** 4. Classic frame: coloured frame, brand bar on top, price bar below */
function lFrame(k: K, th: Theme): Layer[] {
  const topBar = k.f === 'story' ? k.t + 90 : 130;
  const botBar = k.f === 'story' ? k.H - k.b + 230 : k.f === 'portrait' ? 270 : 230;
  const m = 40;
  return [
    shape({ name: 'Вікно', x: m, y: topBar, w: k.W - m * 2, h: k.H - topBar - botBar, radius: 28, fill: solid(th.surface) }),
    photo({ x: m, y: topBar, w: k.W - m * 2, h: k.H - topBar - botBar, radius: 28, pad: 7 }),
    brand(th, { x: m + 12, y: topBar - 100, w: 640, h: 80 }, { color: th.onAccent, size: 36, vAlign: 'middle' }),
    ...pillBadge(th, k.W - m, topBar - 96, { size: 32, color: th.sale, align: 'right' }),
    title(k, th, { x: m + 12, y: k.H - botBar + 28, w: k.W - m * 2 - 24, h: k.f === 'square' ? 96 : 110 }, { color: th.onAccent, size: 36 }),
    ...price(th, { x: m + 12, y: k.H - botBar + (k.f === 'square' ? 128 : 150), w: 700 }, 'row', { color: th.onAccent, oldColor: th.onAccent + 'A6', accent: th.onAccent, size: 58 }),
  ];
}

/** 5. Arch: product in a tall capsule window, quiet centred typography (jewelry, beauty) */
function lArch(k: K, th: Theme): Layer[] {
  const ih = infoH(k) + 10;
  const h = k.b - k.t - ih;
  const w = Math.min(k.W - 2 * 150, Math.round(h * (k.f === 'square' ? 0.82 : 0.72)));
  const x = (k.W - w) / 2;
  return [
    shape({ name: 'Арка', x, y: k.t, w, h, radius: w / 2, fill: solid(th.surface) }),
    photo({ x, y: k.t, w, h, radius: w / 2, pad: 14 }),
    shape({ name: 'Лінія', x: k.W / 2 - 60, y: k.t + h + 34, w: 120, h: 2, fill: solid(th.accent) }),
    brand(th, { x: k.s, y: k.t + h + 56, w: k.W - k.s * 2, h: 44 }, { align: 'center', color: th.accent, size: 26, letterSpacing: 6 }),
    title(k, th, { x: k.s + 60, y: k.t + h + 108, w: k.W - (k.s + 60) * 2, h: k.f === 'square' ? 70 : 90 }, { align: 'center', font: th.head, weight: th.headWeight, size: k.f === 'square' ? 36 : 42, maxLines: 2 }),
    ...price(th, { x: k.s, y: k.b - 78, w: k.W - k.s * 2 }, 'row', { align: 'center', size: 46, font: th.body }),
    ...circleBadge(th, x + w - 40, k.t + 70, 62, { color: th.accent, font: th.body }),
  ];
}

/** 6. Stage: product on a big soft circle, playful burst badge (kids, beauty, tech-dark) */
function lStage(k: K, th: Theme): Layer[] {
  const ih = infoH(k);
  const area = k.b - k.t - ih;
  const d = Math.min(k.W - 120, area - 10);
  const cx = k.W / 2;
  const cy = k.t + area / 2;
  return [
    shape({ name: 'Коло', shape: 'ellipse', x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: solid(th.surface) }),
    shape({ name: 'Крапка 1', shape: 'ellipse', x: 90, y: k.t + 40, w: 46, h: 46, fill: solid(th.accent) }),
    shape({ name: 'Крапка 2', shape: 'ellipse', x: k.W - 150, y: cy + d / 2 - 90, w: 30, h: 30, fill: solid(th.sale) }),
    photo({ x: cx - d / 2, y: cy - d / 2, w: d, h: d, radius: d / 2, pad: 12, mode: modeOn(th.surface) }),
    ...burstBadge(th, k.W - 170, k.t + 110, 100, { rotate: 12 }),
    title(k, th, { x: k.s, y: k.b - ih + 30, w: k.W - k.s * 2, h: 110 }, { align: 'center', font: th.head, weight: th.headWeight }),
    ...price(th, { x: k.s, y: k.b - 96, w: k.W - k.s * 2 }, 'row', { align: 'center', size: 60 }),
  ];
}

/** 7. Mega sale: huge discount typography; non-discounted products get a "hit" headline instead */
function lSale(k: K, th: Theme): Layer[] {
  const headH = k.f === 'square' ? 230 : 270;
  const ih = k.f === 'square' ? 200 : 240;
  const cardY = k.t + headH;
  const cardH = k.b - cardY - ih;
  return [
    text({ name: 'Велика знижка', text: '−{{discount_percent}}%', x: k.s, y: k.t, w: k.W - k.s * 2, h: headH, font: 'Unbounded', weight: 900, size: 200, color: th.onAccent, align: 'center', maxLines: 1, autoFit: true, minSize: 90, condition: structuredClone(IF_DISCOUNT) }),
    text({ name: 'Заголовок (без знижки)', text: 'ХІТ ПРОДАЖІВ', x: k.s, y: k.t, w: k.W - k.s * 2, h: headH, font: 'Unbounded', weight: 900, size: 110, color: th.onAccent, align: 'center', maxLines: 1, autoFit: true, minSize: 50, condition: structuredClone(IF_NO_DISCOUNT) }),
    shape({ name: 'Картка', x: k.s, y: cardY, w: k.W - k.s * 2, h: cardH, radius: 36, fill: solid('#ffffff'), rotation: -2, shadow: { color: 'rgba(0,0,0,0.22)', blur: 30, x: 0, y: 14 } }),
    photo({ x: k.s, y: cardY, w: k.W - k.s * 2, h: cardH, radius: 36, pad: 8, rotation: -2 }),
    title(k, th, { x: k.s, y: k.b - ih + 26, w: k.W - k.s * 2, h: 90 }, { color: th.onAccent, align: 'center', size: 36 }),
    ...price(th, { x: k.s, y: k.b - 92, w: k.W - k.s * 2 }, 'row', { align: 'center', color: th.onAccent, oldColor: th.onAccent + 'B3', accent: '#FFE14D', size: 66, font: 'Unbounded' }),
  ];
}

/** 8. Editorial: giant brand wordmark, product below, magazine-like details (fashion) */
function lEditorial(k: K, th: Theme): Layer[] {
  const headH = k.f === 'square' ? 170 : 210;
  const ih = k.f === 'square' ? 150 : 190;
  const py = k.t + headH;
  const ph = k.b - py - ih;
  return [
    text({ name: 'Бренд великий', text: '{{brand|upper}}', x: k.s, y: k.t, w: k.W - k.s * 2, h: headH, font: th.head, weight: th.headWeight, size: 170, color: th.ink, align: 'center', maxLines: 1, autoFit: true, minSize: 60, letterSpacing: -2 }),
    shape({ name: 'Лінія', x: k.s, y: py - 8, w: k.W - k.s * 2, h: 3, fill: solid(th.ink) }),
    shape({ name: 'Фон фото', x: k.s, y: py + 20, w: k.W - k.s * 2, h: ph - 20, fill: solid(th.surface) }),
    photo({ x: k.s, y: py + 20, w: k.W - k.s * 2, h: ph - 20, pad: 6 }),
    text({ name: 'Знижка %', text: 'SALE −{{discount_percent}}%', x: k.s + 24, y: py + 44, w: 460, h: 60, font: th.body, weight: 800, size: 28, letterSpacing: 2, color: '#ffffff', autoWidth: true, maxLines: 1, bg: { color: th.sale, radius: 0, padX: 20, padY: 0 }, condition: structuredClone(IF_DISCOUNT) }),
    title(k, th, { x: k.s, y: k.b - ih + 22, w: 600, h: ih - 30 }, { font: th.body, weight: 500, size: 32, transform: 'uppercase', letterSpacing: 1, maxLines: 3, minSize: 22 }),
    ...price(th, { x: k.W - k.s - 400, y: k.b - ih + 22, w: 400 }, 'stack', { align: 'right', size: 54, font: th.body }),
  ];
}

/** 9. Tech specs: dark scene, product tile, three benefit chips (gadgets) */
function lSpecs(k: K, th: Theme): Layer[] {
  const chips = ['Офіційна гарантія', 'Доставка 1–2 дні', 'Оплата частинами'];
  const icons = ['shield-check', 'truck', 'wallet'];
  const tall = k.f !== 'square';
  const ih = tall ? 420 : 300;
  const ph = k.b - k.t - ih;
  const L: Layer[] = [
    shape({ name: 'Світіння', shape: 'ellipse', x: -200, y: k.t - 120, w: k.W + 400, h: ph + 240, fill: { color: th.accent, gradient: { from: th.accent + '55', to: th.bg + '00', angle: 180 } } }),
    shape({ name: 'Плитка', x: k.s, y: k.t, w: k.W - k.s * 2, h: ph, radius: 36, fill: solid(th.surface) }),
    photo({ x: k.s, y: k.t, w: k.W - k.s * 2, h: ph, radius: 36, pad: 8, mode: 'card' }),
    ...pillBadge(th, k.s + 26, k.t + 26, { size: 32, color: th.sale }),
    brand(th, { x: k.s, y: k.t + ph + 26, w: 600, h: 40 }, { color: th.accent, size: 24 }),
    title(k, th, { x: k.s, y: k.t + ph + 70, w: tall ? k.W - k.s * 2 : 600, h: tall ? 110 : 120 }, { color: th.ink, font: th.head, weight: th.headWeight, size: tall ? 42 : 36, minSize: 24 }),
  ];
  if (tall) {
    chips.forEach((c, i) => {
      const cw = (k.W - k.s * 2 - 24) / 3;
      const x = k.s + i * (cw + 12);
      const y = k.t + ph + 196;
      L.push(shape({ name: 'Плашка', x, y, w: cw, h: 74, radius: 37, fill: solid('rgba(255,255,255,0.08)'), stroke: { color: 'rgba(255,255,255,0.16)', width: 2 } }));
      L.push(makeIcon({ name: 'Іконка', icon: icons[i], x: x + 18, y: y + 19, w: 36, h: 36, color: th.accent, strokeWidth: 2 }));
      L.push(text({ name: 'Перевага', text: c, x: x + 62, y, w: cw - 74, h: 74, font: th.body, weight: 600, size: 22, color: th.ink, maxLines: 2, autoFit: true, minSize: 16, lineHeight: 110 }));
    });
    L.push(...price(th, { x: k.s, y: k.b - 92, w: 760 }, 'row', { size: 64, accent: th.accent, color: th.ink, oldColor: th.muted, font: th.head }));
  } else {
    chips.forEach((c, i) => {
      const y = k.t + ph + 30 + i * 56;
      L.push(makeIcon({ name: 'Іконка', icon: icons[i], x: 690, y: y + 6, w: 34, h: 34, color: th.accent, strokeWidth: 2 }));
      L.push(text({ name: 'Перевага', text: c, x: 736, y, w: 290, h: 46, font: th.body, weight: 600, size: 22, color: th.ink, maxLines: 1, autoFit: true, minSize: 16 }));
    });
    L.push(...price(th, { x: k.s, y: k.b - 76, w: 620 }, 'row', { size: 56, accent: th.accent, color: th.ink, oldColor: th.muted, font: th.head }));
  }
  return L;
}

/** 10. Polaroid: tilted white photo card on a pastel background with confetti (kids, home) */
function lPolaroid(k: K, th: Theme): Layer[] {
  const pad = 34;
  const cw = k.W - k.s * 2 - 40;
  const ch = Math.min(k.b - k.t - (k.f === 'square' ? 140 : 210), Math.round(cw * 1.18));
  const cx = (k.W - cw) / 2;
  const cy = k.t + 10;
  const capH = 150;
  const dots = [
    [70, k.t + 30, 36, th.accent],
    [k.W - 110, k.t + ch * 0.45, 26, th.sale],
    [100, cy + ch - 60, 22, th.sale],
    [k.W - 160, cy + ch + 40, 40, th.accent],
  ] as const;
  return [
    ...dots.map(([x, y, d, c]) => shape({ name: 'Конфеті', shape: 'ellipse', x, y, w: d, h: d, fill: solid(c) })),
    shape({ name: 'Полароїд', x: cx, y: cy, w: cw, h: ch, radius: 12, rotation: -3, fill: solid('#ffffff'), shadow: { color: 'rgba(60,40,20,0.18)', blur: 34, x: 0, y: 16 } }),
    photo({ x: cx + pad, y: cy + pad, w: cw - pad * 2, h: ch - pad - capH, rotation: -3, pad: 6, mode: 'card' }),
    title(k, th, { x: cx + pad, y: cy + ch - capH + 14, w: cw - pad * 2, h: capH - 40 }, { rotation: -3, font: 'Caveat', weight: 700, size: 52, minSize: 32, color: th.ink, align: 'center', vAlign: 'middle' }),
    ...burstBadge(th, k.W - 150, k.t + 70, 96, { rotate: 14 }),
    ...price(th, { x: k.s, y: k.b - (k.f === 'square' ? 88 : 110), w: k.W - k.s * 2 }, 'row', { align: 'center', size: 62, font: th.head }),
  ];
}

/** 11. Price ticket: big product, ticket-shaped price tag below (home, universal) */
function lTicket(k: K, th: Theme): Layer[] {
  const tH = k.f === 'square' ? 230 : 270;
  const ph = k.b - k.t - tH - 30;
  const ty = k.b - tH;
  const notch = 34;
  return [
    photo({ x: k.s, y: k.t, w: k.W - k.s * 2, h: ph, radius: 30, pad: 6 }),
    shape({ name: 'Квиток', x: k.s, y: ty, w: k.W - k.s * 2, h: tH, radius: 26, fill: solid(th.accent) }),
    shape({ name: 'Виріз лівий', shape: 'ellipse', x: k.s - notch, y: ty + tH / 2 - notch, w: notch * 2, h: notch * 2, fill: solid(th.bg) }),
    shape({ name: 'Виріз правий', shape: 'ellipse', x: k.W - k.s - notch, y: ty + tH / 2 - notch, w: notch * 2, h: notch * 2, fill: solid(th.bg) }),
    shape({ name: 'Пунктир', x: k.W - k.s - 380, y: ty + 30, w: 3, h: tH - 60, fill: solid(th.onAccent + '55') }),
    title(k, th, { x: k.s + 60, y: ty + 30, w: k.W - k.s * 2 - 470, h: tH - 60 }, { color: th.onAccent, vAlign: 'middle', size: 38, maxLines: 3, minSize: 24 }),
    ...price(th, { x: k.W - k.s - 350, y: ty + tH / 2 - 70, w: 310 }, 'stack', { align: 'center', color: th.onAccent, oldColor: th.onAccent + 'B3', accent: th.onAccent, size: 54 }),
    ...pillBadge(th, k.s + 24, k.t + 24, { size: 32 }),
  ];
}

/** 12. Duo: main photo + second photo of the product (falls back to a single large photo) */
function lDuo(k: K, th: Theme): Layer[] {
  const HAS2 = { action: 'show' as const, mode: 'all' as const, rules: [{ field: 'additional_image_link', op: 'exists' as const }] };
  const NO2 = { action: 'show' as const, mode: 'all' as const, rules: [{ field: 'additional_image_link', op: 'not_exists' as const }] };
  const ih = k.f === 'square' ? 190 : 240;
  const ph = k.b - k.t - ih;
  const gap = 16;
  const w1 = Math.round((k.W - k.s * 2 - gap) * 0.62);
  const w2 = k.W - k.s * 2 - gap - w1;
  return [
    photo({ name: 'Фото товару', x: k.s, y: k.t, w: w1, h: ph, radius: 24, pad: 6, mode: 'card', condition: HAS2 }),
    photo({ name: 'Фото 2', x: k.s + w1 + gap, y: k.t, w: w2, h: ph, radius: 24, pad: 6, mode: 'card', source: { kind: 'field', field: 'additional_image_link', index: 0 }, condition: HAS2 }),
    photo({ name: 'Фото (одне)', x: k.s, y: k.t, w: k.W - k.s * 2, h: ph, radius: 24, pad: 6, mode: 'card', condition: NO2 }),
    ...pillBadge(th, k.s + 22, k.t + 22, { size: 30 }),
    brand(th, { x: k.s, y: k.b - ih + 26, w: 600, h: 40 }, { size: 24 }),
    title(k, th, { x: k.s, y: k.b - ih + 70, w: 600, h: ih - 80 }, { size: 34, minSize: 22, maxLines: 2 }),
    ...price(th, { x: k.W - k.s - 380, y: k.b - ih + 26, w: 380 }, 'stack', { align: 'right', size: 56, font: th.body }),
  ];
}

/** 13. Thin line premium: hairline frame, centred serif, lots of air (jewelry, premium) */
function lLine(k: K, th: Theme): Layer[] {
  const m = 40;
  const ih = infoH(k);
  return [
    shape({ name: 'Рамка', x: m, y: k.f === 'story' ? k.t - 60 : m, w: k.W - m * 2, h: k.f === 'story' ? k.b - k.t + 120 : k.H - m * 2, fill: null, stroke: { color: th.accent, width: 2 } }),
    brand(th, { x: k.s, y: k.t + 34, w: k.W - k.s * 2, h: 50 }, { align: 'center', color: th.ink, size: 30, letterSpacing: 8, font: th.head }),
    photo({ x: k.s + 60, y: k.t + 110, w: k.W - (k.s + 60) * 2, h: k.b - k.t - 110 - ih, pad: 10 }),
    title(k, th, { x: k.s + 60, y: k.b - ih + 20, w: k.W - (k.s + 60) * 2, h: 90 }, { align: 'center', font: th.head, weight: th.headWeight, size: 38, maxLines: 2 }),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: k.s, y: k.b - 160, w: k.W - k.s * 2, h: 44, font: th.body, weight: 600, size: 26, letterSpacing: 4, color: th.sale, align: 'center', maxLines: 1, condition: structuredClone(IF_DISCOUNT) }),
    ...price(th, { x: k.s, y: k.b - 108, w: k.W - k.s * 2 }, 'row', { align: 'center', size: 44, font: th.body, accent: th.ink, color: th.ink }),
  ];
}

/** 14. Bold sport: black scene, acid diagonal stripe, condensed uppercase type */
function lBold(k: K, th: Theme): Layer[] {
  const ih = k.f === 'square' ? 250 : 330;
  const ph = k.b - k.t - ih;
  return [
    shape({ name: 'Діагональ', x: -300, y: k.t + ph * 0.35, w: k.W + 600, h: Math.round(ph * 0.42), rotation: -14, fill: solid(th.accent) }),
    photo({ x: k.s, y: k.t, w: k.W - k.s * 2, h: ph, pad: 4, mode: 'card', radius: 24 }),
    ...pillBadge(th, k.W - k.s, k.t + 20, { size: 38, color: th.accent, ink: th.bg, align: 'right' }),
    text({ name: 'Бренд', text: '{{brand|upper}}', x: k.s, y: k.b - ih + 26, w: 700, h: 50, font: 'Oswald', weight: 600, size: 34, letterSpacing: 3, color: th.accent, maxLines: 1, autoFit: true }),
    title(k, th, { x: k.s, y: k.b - ih + 80, w: k.W - k.s * 2, h: k.f === 'square' ? 80 : 120 }, { font: 'Oswald', weight: 700, size: k.f === 'square' ? 48 : 58, transform: 'uppercase', color: th.ink, lineHeight: 105, minSize: 32 }),
    ...price(th, { x: k.s, y: k.b - 92, w: 760 }, 'row', { font: 'Oswald', size: 72, accent: th.accent, color: th.ink, oldColor: th.muted }),
  ];
}

// ======================= themes =======================
const T: Record<string, Theme> = {
  blush: { bg: '#F7E9E6', surface: '#FFFFFF', ink: '#3A2A2A', muted: '#A08A86', accent: '#C9897F', onAccent: '#FFFFFF', sale: '#D9534F', head: 'Playfair Display', headWeight: 600, body: 'Mulish', bodyWeight: 500 },
  fashion: { bg: '#111111', surface: '#F2F0ED', ink: '#111111', muted: '#8C8C8C', accent: '#111111', onAccent: '#FFFFFF', sale: '#E53935', head: 'Montserrat', headWeight: 800, body: 'Montserrat', bodyWeight: 500 },
  terracotta: { bg: '#F4EEE6', surface: '#F4EEE6', ink: '#2E2A26', muted: '#8E8378', accent: '#C2643F', onAccent: '#FFFFFF', sale: '#B23A2A', head: 'Literata', headWeight: 600, body: 'Manrope', bodyWeight: 500 },
  orange: { bg: '#FF6B1A', surface: '#FFFFFF', ink: '#1C1C1C', muted: '#9A9A9A', accent: '#FF6B1A', onAccent: '#FFFFFF', sale: '#111111', head: 'Manrope', headWeight: 800, body: 'Manrope', bodyWeight: 600 },
  ivory: { bg: '#F7F3EE', surface: '#FFFFFF', ink: '#2B2620', muted: '#9C9283', accent: '#B08D57', onAccent: '#FFFFFF', sale: '#9E3B32', head: 'Cormorant Garamond', headWeight: 600, body: 'Mulish', bodyWeight: 500 },
  pastel: { bg: '#FDF1F5', surface: '#FFE0EA', ink: '#3B3355', muted: '#9C93B5', accent: '#8FD3C8', onAccent: '#3B3355', sale: '#FF7A59', head: 'Nunito', headWeight: 900, body: 'Nunito', bodyWeight: 700 },
  sale: { bg: '#E53935', surface: '#FFFFFF', ink: '#111111', muted: '#999999', accent: '#E53935', onAccent: '#FFFFFF', sale: '#111111', head: 'Unbounded', headWeight: 800, body: 'Manrope', bodyWeight: 600 },
  cream: { bg: '#EFEAE2', surface: '#E5DED3', ink: '#141414', muted: '#7D776E', accent: '#141414', onAccent: '#FFFFFF', sale: '#C2362B', head: 'Unbounded', headWeight: 800, body: 'Manrope', bodyWeight: 500 },
  tech: { bg: '#0D1117', surface: '#FFFFFF', ink: '#F2F5FA', muted: '#8B95A7', accent: '#3D8BFF', onAccent: '#FFFFFF', sale: '#FF3D71', head: 'Geologica', headWeight: 700, body: 'IBM Plex Sans', bodyWeight: 500 },
  butter: { bg: '#FFF4D6', surface: '#FFFFFF', ink: '#3A3226', muted: '#A0947C', accent: '#7CC6FE', onAccent: '#1F2A44', sale: '#FF6B6B', head: 'Comfortaa', headWeight: 700, body: 'Nunito', bodyWeight: 700 },
  sage: { bg: '#E9EEE6', surface: '#FFFFFF', ink: '#26302A', muted: '#7E8A80', accent: '#4F6B57', onAccent: '#FFFFFF', sale: '#C2643F', head: 'Manrope', headWeight: 800, body: 'Manrope', bodyWeight: 500 },
  white: { bg: '#FFFFFF', surface: '#F4F4F4', ink: '#111111', muted: '#8A8A8A', accent: '#111111', onAccent: '#FFFFFF', sale: '#E53935', head: 'Montserrat', headWeight: 700, body: 'Montserrat', bodyWeight: 500 },
  noir: { bg: '#FFFFFF', surface: '#FFFFFF', ink: '#111111', muted: '#8A8A8A', accent: '#111111', onAccent: '#FFFFFF', sale: '#A3262A', head: 'Cormorant Garamond', headWeight: 600, body: 'Mulish', bodyWeight: 500 },
  sport: { bg: '#0B0B0B', surface: '#FFFFFF', ink: '#FFFFFF', muted: '#9A9A9A', accent: '#C6FF3D', onAccent: '#0B0B0B', sale: '#C6FF3D', head: 'Oswald', headWeight: 700, body: 'Manrope', bodyWeight: 600 },
  neon: { bg: '#120C2A', surface: '#2A1F5C', ink: '#FFFFFF', muted: '#A79CD6', accent: '#7B5CFF', onAccent: '#FFFFFF', sale: '#FF4FD8', head: 'Unbounded', headWeight: 700, body: 'Geologica', bodyWeight: 500 },
  sand: { bg: '#EFE6DA', surface: '#FBF8F3', ink: '#3A332B', muted: '#9A8F80', accent: '#3A332B', onAccent: '#FBF8F3', sale: '#B5543A', head: 'Cormorant', headWeight: 700, body: 'Manrope', bodyWeight: 500 },
};

interface Entry {
  key: string;
  name: string;
  layout: (k: K, th: Theme) => Layer[];
  theme: keyof typeof T;
  niches: Niche[];
  /** canvas background: theme.bg unless a layout needs another */
  bg?: (th: Theme) => DesignDoc['background'];
  hint: string;
}

const ENTRIES: Entry[] = [
  { key: 'clean-blush', name: 'Ніжна картка', layout: lClean, theme: 'blush', niches: ['beauty', 'fashion'], hint: 'Товар на білій картці, м’яка пудрова гама' },
  { key: 'bleed', name: 'Лукбук на весь кадр', layout: lBleed, theme: 'fashion', niches: ['fashion', 'sport'], hint: 'Фото з моделлю на весь кадр, текст на затемненні' },
  { key: 'split-terracotta', name: 'Сплит з кольоровою панеллю', layout: lSplit, theme: 'terracotta', niches: ['home'], hint: 'Фото + теракотова інфопанель' },
  { key: 'frame', name: 'Класична рамка', layout: lFrame, theme: 'orange', niches: ['sale', 'home', 'tech', 'kids'], hint: 'Кольорова рамка з брендом і ціною — найкраще для ремаркетингу' },
  { key: 'arch-ivory', name: 'Арка для прикрас', layout: lArch, theme: 'ivory', niches: ['jewelry', 'beauty'], hint: 'Капсула, золото, засічки — спокійна розкіш' },
  { key: 'stage-pastel', name: 'Пастельний подіум', layout: lStage, theme: 'pastel', niches: ['kids', 'beauty'], hint: 'Товар на колі, конфеті та бейдж-зірка' },
  { key: 'sale', name: 'Мега-знижка', layout: lSale, theme: 'sale', niches: ['sale'], hint: 'Величезний відсоток знижки; без знижки — «Хіт продажів»' },
  { key: 'editorial', name: 'Журнальна обкладинка', layout: lEditorial, theme: 'cream', niches: ['fashion'], hint: 'Великий бренд угорі, як на обкладинці' },
  { key: 'specs-tech', name: 'Гаджет + переваги', layout: lSpecs, theme: 'tech', niches: ['tech'], hint: 'Темна сцена, плитка товару й три переваги' },
  { key: 'polaroid', name: 'Полароїд', layout: lPolaroid, theme: 'butter', niches: ['kids', 'home'], hint: 'Нахилена фотокартка, рукописна назва' },
  { key: 'ticket-sage', name: 'Цінник', layout: lTicket, theme: 'sage', niches: ['home', 'sale'], hint: 'Ціна на квитку-цінику під фото' },
  { key: 'duo', name: 'Дві фото', layout: lDuo, theme: 'white', niches: ['fashion', 'home'], hint: 'Головне фото + додаткові ракурси з фіду' },
  { key: 'line-noir', name: 'Тонка рамка преміум', layout: lLine, theme: 'noir', niches: ['jewelry', 'fashion'], hint: 'Тонка лінія, багато повітря, засічки' },
  { key: 'bold-sport', name: 'Спорт драйв', layout: lBold, theme: 'sport', niches: ['sport'], hint: 'Чорний, кислотна діагональ, вузький шрифт' },
  { key: 'stage-neon', name: 'Неонова сцена', layout: lStage, theme: 'neon', niches: ['tech'], hint: 'Товар у світловому колі, неонові акценти' },
  { key: 'clean-sand', name: 'Затишний дім', layout: lClean, theme: 'sand', niches: ['home', 'jewelry'], hint: 'Пісочна гама, засічки, біла картка' },
];

export interface LibTemplate {
  id: string;
  name: string;
  formatId: LibFormat;
  niches: Niche[];
  hint: string;
  doc: DesignDoc;
}

export function libraryTemplates(): LibTemplate[] {
  const out: LibTemplate[] = [];
  for (const f of ['square', 'portrait', 'story'] as LibFormat[]) {
    for (const e of ENTRIES) {
      const th = T[e.theme];
      const k = kit(f);
      const layers = e.layout(k, th);
      layers.forEach((l, i) => (l.id = `t${i}`));
      const [W, H] = SIZES[f];
      out.push({
        id: `lib-${e.key}-${f}`,
        name: e.name,
        formatId: f,
        niches: e.niches,
        hint: e.hint,
        doc: { width: W, height: H, background: e.bg ? e.bg(th) : { color: th.bg }, layers, format: { ...DEFAULT_FORMAT } },
      });
    }
  }
  return out;
}
