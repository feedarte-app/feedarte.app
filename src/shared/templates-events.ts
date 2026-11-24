// Seasonal / occasion templates: Black Friday, Cyber Monday, New Year, Christmas, winter sale,
// Valentine's Day, 8 March, back to school, summer sale, store birthday.
// Event copy ("BLACK FRIDAY", "ДО -70%", CTA) is plain text the user edits; price, title and the
// per-product discount badge come from the feed. Three layouts × 1:1 / 4:5 / 9:16:
//  - side:   product card + vertical event panel (story: panel moves below the photo)
//  - top:    big event headline above the product card, price below
//  - frame:  full-bleed photo in a thick event frame, ribbon with event + price
// 9:16 keeps all text inside the Stories/Reels safe area (y 220…1580).
import type { DesignDoc, Fill, Layer, TextLayer } from './types';
import { DEFAULT_FORMAT } from './types';
import { IF_DISCOUNT, makeIcon, makeImage, makePriceBlock, makeShape, makeText } from './layers';
import type { BuiltinTemplate } from './templates';

type F = 'square' | 'portrait' | 'story';
type LayoutId = 'side' | 'top' | 'frame';

interface Ev {
  id: string;
  name: string;
  bg: Fill; // page background
  panel: Fill; // side panel / ribbon
  card: string; // product card
  ink: string; // text on bg / panel
  sub: string; // secondary text on bg / panel
  accent: string; // big "-70%" line
  badge: string; // per-product discount badge
  badgeInk: string;
  priceAccent: string; // discounted price on the card side
  cta: { bg: string; fg: string };
  head: string;
  headWeight: number;
  body: string;
  title: string; // event headline, may contain \n
  kicker: string; // "ДО -70%"
  line: string; // short supporting line
  ctaText: string;
  decor?: { icon: string; color: string; opacity: number };
  /** text colours on the coloured panel / ribbon when they differ from the page (light page, dark panel) */
  onPanel?: { ink: string; sub: string; accent: string; decor?: string };
  titleItalic?: boolean;
  titleSpacing?: number;
  layouts: LayoutId[];
}

const SIZE: Record<F, [number, number]> = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920] };

const g = (from: string, to: string, angle = 180): Fill => ({ color: from, gradient: { from, to, angle } });
const radial = (from: string, to: string): Fill => ({ color: to, gradient: { from, to, angle: 0, type: 'radial', smooth: true } });

const EVENTS: Ev[] = [
  {
    id: 'bf-red',
    name: 'Black Friday — бордо',
    bg: g('#5A0008', '#1A0003', 160),
    panel: g('#7A000C', '#240004', 180),
    card: '#F4F4F4',
    ink: '#FFFFFF',
    sub: '#F2C9CC',
    accent: '#FFFFFF',
    badge: '#FFFFFF',
    badgeInk: '#7A000C',
    priceAccent: '#B3000F',
    cta: { bg: '#FFFFFF', fg: '#7A000C' },
    head: 'Russo One',
    headWeight: 400,
    body: 'Montserrat',
    title: 'BLACK\nFRIDAY',
    kicker: 'ДО -70%',
    line: 'Найбільший розпродаж року',
    ctaText: 'КУПИТИ',
    layouts: ['side', 'top', 'frame'],
  },
  {
    id: 'bf-black',
    name: 'Black Friday — чорний і жовтий',
    bg: { color: '#0A0A0A' },
    panel: { color: '#0A0A0A' },
    card: '#FFFFFF',
    ink: '#FFFFFF',
    sub: '#A3A3A3',
    accent: '#FFE600',
    badge: '#FFE600',
    badgeInk: '#0A0A0A',
    priceAccent: '#0A0A0A',
    cta: { bg: '#FFE600', fg: '#0A0A0A' },
    head: 'Unbounded',
    headWeight: 900,
    body: 'Inter',
    title: 'BLACK FRIDAY',
    kicker: '-70%',
    line: 'Тільки цього тижня',
    ctaText: 'ЗАБРАТИ ЗІ ЗНИЖКОЮ',
    decor: { icon: 'zap', color: '#FFE600', opacity: 100 },
    layouts: ['top', 'side', 'frame'],
  },
  {
    id: 'cyber',
    name: 'Cyber Monday — неон',
    bg: g('#070B2E', '#14062E', 150),
    panel: g('#0B1446', '#1B0840', 180),
    card: '#FFFFFF',
    ink: '#FFFFFF',
    sub: '#9FB4FF',
    accent: '#00F0FF',
    badge: '#FF2BD6',
    badgeInk: '#FFFFFF',
    priceAccent: '#7B2CFF',
    cta: { bg: '#00F0FF', fg: '#070B2E' },
    head: 'Exo 2',
    headWeight: 900,
    body: 'Exo 2',
    title: 'CYBER\nMONDAY',
    kicker: '-50% ОНЛАЙН',
    line: 'Лише 24 години',
    ctaText: 'ДО КОШИКА',
    titleItalic: true,
    decor: { icon: 'zap', color: '#00F0FF', opacity: 70 },
    layouts: ['top', 'side'],
  },
  {
    id: 'newyear',
    name: 'Новий рік — синій і золото',
    bg: radial('#1C2F6B', '#070E2A'),
    panel: g('#13235A', '#070E2A', 180),
    card: '#FFFFFF',
    ink: '#FFFFFF',
    sub: '#C9B37E',
    accent: '#E8C77A',
    badge: '#E8C77A',
    badgeInk: '#0B1638',
    priceAccent: '#0B1638',
    cta: { bg: '#E8C77A', fg: '#0B1638' },
    head: 'Playfair Display',
    headWeight: 700,
    body: 'Montserrat',
    title: 'З Новим\nроком!',
    kicker: 'СВЯТКОВІ ЗНИЖКИ',
    line: 'Подарунки, які точно сподобаються',
    ctaText: 'ОБРАТИ ПОДАРУНОК',
    titleItalic: true,
    decor: { icon: 'snowflake', color: '#E8C77A', opacity: 55 },
    layouts: ['top', 'side', 'frame'],
  },
  {
    id: 'xmas',
    name: 'Різдво — зелений і червоний',
    bg: g('#0F3D2E', '#07261C', 170),
    panel: g('#B3121F', '#7E0B15', 180),
    card: '#FBF6EE',
    ink: '#FBF6EE',
    sub: '#E9D9BE',
    accent: '#F3D27A',
    badge: '#B3121F',
    badgeInk: '#FFFFFF',
    priceAccent: '#B3121F',
    cta: { bg: '#FBF6EE', fg: '#0F3D2E' },
    head: 'Prata',
    headWeight: 400,
    body: 'Lora',
    title: 'Різдвяний\nрозпродаж',
    kicker: 'ДО -40%',
    line: 'Встигніть до свят',
    ctaText: 'ДИВИТИСЬ',
    decor: { icon: 'tree-pine', color: '#F3D27A', opacity: 45 },
    layouts: ['side', 'top'],
  },
  {
    id: 'winter',
    onPanel: { ink: '#FFFFFF', sub: '#D6E8FA', accent: '#FFFFFF' , decor: '#FFFFFF' },
    name: 'Зимовий розпродаж',
    bg: g('#E8F3FB', '#C9E2F4', 180),
    panel: g('#2B6CB0', '#1A4A80', 180),
    card: '#FFFFFF',
    ink: '#0F2A4A',
    sub: '#4A6A8C',
    accent: '#2B6CB0',
    badge: '#2B6CB0',
    badgeInk: '#FFFFFF',
    priceAccent: '#2B6CB0',
    cta: { bg: '#0F2A4A', fg: '#FFFFFF' },
    head: 'Montserrat',
    headWeight: 900,
    body: 'Montserrat',
    title: 'ЗИМОВИЙ\nSALE',
    kicker: 'ДО -50%',
    line: 'Тепло за приємними цінами',
    ctaText: 'КУПИТИ',
    decor: { icon: 'snowflake', color: '#2B6CB0', opacity: 30 },
    layouts: ['top', 'frame'],
  },
  {
    id: 'gifts',
    name: 'Ідеї подарунків',
    bg: g('#C8102E', '#8E0A1F', 160),
    panel: g('#C8102E', '#8E0A1F', 180),
    card: '#FFFFFF',
    ink: '#FFFFFF',
    sub: '#FFD9DE',
    accent: '#FFFFFF',
    badge: '#FFFFFF',
    badgeInk: '#C8102E',
    priceAccent: '#C8102E',
    cta: { bg: '#FFFFFF', fg: '#C8102E' },
    head: 'Unbounded',
    headWeight: 800,
    body: 'Manrope',
    title: 'Ідеальний\nподарунок',
    kicker: 'ПАКУЄМО У ПОДАРУНКОВЕ',
    line: 'Доставимо до свят',
    ctaText: 'ОБРАТИ',
    decor: { icon: 'gift', color: '#FFFFFF', opacity: 35 },
    layouts: ['side', 'frame'],
  },
  {
    id: 'valentine',
    onPanel: { ink: '#FFFFFF', sub: '#FFD3E2', accent: '#FFFFFF', decor: '#FFFFFF' },
    name: 'День закоханих',
    bg: g('#FFE3EA', '#FFC7D5', 180),
    panel: g('#E0115F', '#B00C4B', 180),
    card: '#FFFFFF',
    ink: '#8A0A3A',
    sub: '#C2456F',
    accent: '#E0115F',
    badge: '#E0115F',
    badgeInk: '#FFFFFF',
    priceAccent: '#E0115F',
    cta: { bg: '#E0115F', fg: '#FFFFFF' },
    head: 'Great Vibes',
    headWeight: 400,
    body: 'Montserrat',
    title: 'З любов’ю',
    kicker: '14 ЛЮТОГО',
    line: 'Подарунки для найрідніших',
    ctaText: 'ОБРАТИ ПОДАРУНОК',
    decor: { icon: 'heart', color: '#E0115F', opacity: 30 },
    layouts: ['top', 'side'],
  },
  {
    id: 'march8',
    onPanel: { ink: '#FFFFFF', sub: '#EBD9F5', accent: '#FFE3F0', decor: '#FFFFFF' },
    name: '8 березня',
    bg: g('#F6ECFA', '#EAD7F3', 180),
    panel: g('#9B5DB8', '#6E3A8A', 180),
    card: '#FFFFFF',
    ink: '#4A2160',
    sub: '#8A63A0',
    accent: '#9B5DB8',
    badge: '#D6336C',
    badgeInk: '#FFFFFF',
    priceAccent: '#D6336C',
    cta: { bg: '#4A2160', fg: '#FFFFFF' },
    head: 'Playfair Display',
    headWeight: 700,
    body: 'Montserrat',
    title: 'Весна\nдля неї',
    kicker: '8 БЕРЕЗНЯ',
    line: 'Святкові знижки до -30%',
    ctaText: 'ДИВИТИСЬ',
    titleItalic: true,
    decor: { icon: 'flower', color: '#9B5DB8', opacity: 35 },
    layouts: ['top', 'frame'],
  },
  {
    id: 'school',
    onPanel: { ink: '#FFFFFF', sub: '#D3DEFF', accent: '#FFD43B', decor: '#FFFFFF' },
    name: 'Знову до школи',
    bg: g('#FFD43B', '#FFC107', 180),
    panel: g('#1E4FD8', '#163BA3', 180),
    card: '#FFFFFF',
    ink: '#13246B',
    sub: '#3B4A80',
    accent: '#1E4FD8',
    badge: '#E8361E',
    badgeInk: '#FFFFFF',
    priceAccent: '#E8361E',
    cta: { bg: '#13246B', fg: '#FFFFFF' },
    head: 'Rubik',
    headWeight: 900,
    body: 'Rubik',
    title: 'ЗНОВУ\nДО ШКОЛИ',
    kicker: 'ВСЕ ДЛЯ НАВЧАННЯ',
    line: 'Знижки до 1 вересня',
    ctaText: 'ЗІБРАТИ НАБІР',
    decor: { icon: 'pencil', color: '#13246B', opacity: 25 },
    layouts: ['top', 'side'],
  },
  {
    id: 'summer',
    name: 'Літній розпродаж',
    bg: g('#FFB347', '#FF6B3D', 160),
    panel: g('#FF6B3D', '#E8432A', 180),
    card: '#FFFFFF',
    ink: '#FFFFFF',
    sub: '#FFF0E0',
    accent: '#FFF5B8',
    badge: '#1F2A44',
    badgeInk: '#FFFFFF',
    priceAccent: '#E8432A',
    cta: { bg: '#1F2A44', fg: '#FFFFFF' },
    head: 'Unbounded',
    headWeight: 900,
    body: 'Manrope',
    title: 'SUMMER\nSALE',
    kicker: 'ДО -60%',
    line: 'Гарячі знижки на все літо',
    ctaText: 'КУПИТИ',
    decor: { icon: 'sun', color: '#FFFFFF', opacity: 40 },
    layouts: ['frame', 'top'],
  },
  {
    id: 'birthday',
    name: 'День народження магазину',
    bg: g('#2A1B5E', '#120A33', 170),
    panel: g('#FF4D8D', '#C2185B', 180),
    card: '#FFFFFF',
    ink: '#FFFFFF',
    sub: '#C9BDF5',
    accent: '#FFD23F',
    badge: '#FF4D8D',
    badgeInk: '#FFFFFF',
    priceAccent: '#C2185B',
    cta: { bg: '#FFD23F', fg: '#2A1B5E' },
    head: 'Unbounded',
    headWeight: 800,
    body: 'Manrope',
    title: 'Нам 5 років!',
    kicker: 'СВЯТКУЄМО ЗНИЖКАМИ',
    line: 'Дякуємо, що ви з нами',
    ctaText: 'СВЯТКУВАТИ',
    decor: { icon: 'party-popper', color: '#FFD23F', opacity: 70 },
    layouts: ['top', 'side'],
  },
];

// ---------- building blocks ----------

const T = (p: Partial<TextLayer>) => makeText({ hideIfEmpty: false, ...p });

function headline(e: Ev, box: { x: number; y: number; w: number; h: number }, size: number, align: TextLayer['align'] = 'center', color = e.ink): TextLayer {
  const script = e.head === 'Great Vibes';
  return T({
    name: 'Назва акції',
    text: e.title,
    ...box,
    font: e.head,
    weight: e.headWeight,
    italic: !!e.titleItalic && !script,
    size: script ? Math.round(size * 1.35) : size,
    minSize: Math.round(size * 0.45),
    color,
    align,
    lineHeight: script ? 110 : 96,
    letterSpacing: e.titleSpacing ?? 0,
    autoFit: true,
    maxLines: 3,
    shadow: e.id === 'bf-red' ? { color: 'rgba(0,0,0,0.45)', blur: 16, x: 0, y: 6 } : null,
  });
}

function kicker(e: Ev, box: { x: number; y: number; w: number; h: number }, size: number, align: TextLayer['align'] = 'center', color = e.accent): TextLayer {
  return T({ name: 'Знижка акції', text: e.kicker, ...box, font: e.head === 'Great Vibes' || e.head === 'Prata' || e.head === 'Playfair Display' ? e.body : e.head, weight: 900, size, minSize: Math.round(size * 0.5), color, align, autoFit: true, maxLines: 2, lineHeight: 100 });
}

function line(e: Ev, box: { x: number; y: number; w: number; h: number }, size: number, align: TextLayer['align'] = 'center', color = e.sub): TextLayer {
  return T({ name: 'Підпис акції', text: e.line, ...box, font: e.body, weight: 600, size, minSize: Math.round(size * 0.6), color, align, autoFit: true, maxLines: 2, lineHeight: 115 });
}

function cta(e: Ev, box: { x: number; y: number; w: number; h: number }, size: number, align: TextLayer['align'] = 'center'): TextLayer {
  return T({ name: 'Кнопка', text: e.ctaText, ...box, font: e.body, weight: 800, size, minSize: Math.round(size * 0.6), color: e.cta.fg, align, autoWidth: true, autoFit: true, maxLines: 1, letterSpacing: 1, bg: { color: e.cta.bg, radius: 6, padX: Math.round(size * 1.1), padY: 0 } });
}

function badge(e: Ev, x: number, y: number, d: number): Layer[] {
  return [
    makeShape({ name: 'Плашка знижки', shape: 'burst', points: 16, x, y, w: d, h: d, fill: { color: e.badge }, condition: structuredClone(IF_DISCOUNT), shadow: { color: 'rgba(0,0,0,0.22)', blur: 18, x: 0, y: 6 } }),
    T({ name: 'Знижка товару %', text: '-{{discount_percent}}%', x, y, w: d, h: d, rotation: -10, font: e.body, weight: 900, size: Math.round(d * 0.27), color: e.badgeInk, align: 'center', autoFit: true, maxLines: 1, hideIfEmpty: true }),
  ];
}

function productPhoto(x: number, y: number, w: number, h: number, mode: 'card' | 'blend' = 'card') {
  return makeImage({ name: 'Фото товару', x, y, w, h, fit: 'smart', smart: { pad: 6, bg: mode } });
}

function productTitle(e: Ev, box: { x: number; y: number; w: number; h: number }, size: number, color: string, align: TextLayer['align'] = 'center'): TextLayer {
  return makeText({ name: 'Назва товару', text: '{{title}}', ...box, font: e.body, weight: 600, size, minSize: Math.round(size * 0.65), color, align, maxLines: 2, autoFit: true, lineHeight: 115, hideIfEmpty: true });
}

function decor(e: Ev, spots: [number, number, number, number][]): Layer[] {
  if (!e.decor) return [];
  return spots.map(([x, y, s, rot], i) => makeIcon({ name: `Декор ${i + 1}`, icon: e.decor!.icon, x, y, w: s, h: s, rotation: rot, color: e.decor!.color, strokeWidth: 1.6, opacity: e.decor!.opacity }));
}

/** theme as seen on its coloured panel / ribbon */
function P(e: Ev): Ev {
  if (!e.onPanel) return e;
  const o = e.onPanel;
  return { ...e, ink: o.ink, sub: o.sub, accent: o.accent, decor: e.decor ? { ...e.decor, color: o.decor ?? e.decor.color } : undefined };
}

// ---------- layouts ----------

function side(e0: Ev, f: F): Layer[] {
  const e = P(e0);
  const [W, H] = SIZE[f];
  if (f === 'story') {
    // photo card on top, event block below (inside the safe area)
    return [
      makeShape({ name: 'Панель', x: 0, y: 0, w: W, h: H, fill: e.panel }),
      ...decor(e, [[60, 70, 90, -12], [930, 90, 70, 15]]),
      makeShape({ name: 'Картка товару', x: 56, y: 210, w: W - 112, h: 930, radius: 28, fill: { color: e.card } }),
      productPhoto(56, 210, W - 112, 930),
      ...badge(e, W - 300, 250, 200),
      T({ name: 'Бренд', text: '{{brand|upper}}', x: 96, y: 236, w: 560, h: 60, font: e.body, weight: 800, size: 30, letterSpacing: 3, color: e.priceAccent, maxLines: 1, autoFit: true, hideIfEmpty: true }),
      headline(e, { x: 60, y: 1165, w: W - 120, h: 170 }, 96),
      kicker(e, { x: 60, y: 1340, w: W - 120, h: 100 }, 76),
      ...makePriceBlock({ x: 60, y: 1440, w: 560 }, 'row', { font: e.body, size: 52, accent: e.accent, color: e.ink, oldColor: e.sub, align: 'left' }),
      cta(e, { x: 620, y: 1452, w: 400, h: 86 }, 30, 'right'),
    ];
  }
  const cardW = f === 'square' ? 720 : 740;
  const m = 36;
  const px = m + cardW + 24;
  const pw = W - px - 28;
  const tall = f === 'portrait';
  return [
    makeShape({ name: 'Панель', x: 0, y: 0, w: W, h: H, fill: e.panel }),
    makeShape({ name: 'Картка товару', x: m, y: m, w: cardW, h: H - 2 * m, radius: 10, fill: { color: e.card } }),
    productPhoto(m, m, cardW, H - 2 * m),
    ...badge(e, m + cardW - 190, m + 20, 170),
    T({ name: 'Бренд', text: '{{brand|upper}}', x: px, y: 60, w: pw, h: 60, font: e.body, weight: 800, size: 26, letterSpacing: 2, color: e.ink, align: 'center', maxLines: 1, autoFit: true, hideIfEmpty: true }),
    ...decor(e, [[px + pw / 2 - 30, tall ? 150 : 130, 60, 0]]),
    headline(e, { x: px, y: tall ? 300 : 230, w: pw, h: tall ? 250 : 200 }, 64),
    kicker(e, { x: px, y: tall ? 570 : 450, w: pw, h: tall ? 140 : 120 }, 52),
    line(e, { x: px, y: tall ? 730 : 590, w: pw, h: 110 }, 26),
    ...makePriceBlock({ x: px, y: H - (tall ? 330 : 300), w: pw }, 'stack', { font: e.body, size: 44, accent: e.accent, color: e.ink, oldColor: e.sub }),
    cta(e, { x: px, y: H - 150, w: pw, h: 70 }, 24),
  ];
}

function top(e: Ev, f: F): Layer[] {
  const [W, H] = SIZE[f];
  const L = {
    square: { head: [60, 36, 960, 150, 84], kick: [60, 186, 960, 64, 44], card: [140, 270, 800, 620], title: null, price: 905 },
    portrait: { head: [60, 50, 960, 200, 104], kick: [60, 252, 960, 70, 50], card: [90, 345, 900, 720], title: [90, 1080, 900, 76], price: 1165 },
    story: { head: [60, 230, 960, 230, 120], kick: [60, 465, 960, 80, 56], card: [80, 570, 920, 770], title: [80, 1355, 920, 80], price: 1442 },
  }[f] as { head: number[]; kick: number[]; card: number[]; title: number[] | null; price: number };
  const [cx, cy, cw, ch] = L.card;
  const spots: [number, number, number, number][] =
    f === 'square'
      ? [[30, 300, 70, -15], [990, 330, 60, 12], [40, 820, 56, 10], [980, 800, 70, -10]]
      : f === 'portrait'
        ? [[24, 420, 64, -15], [1000, 470, 56, 12], [26, 960, 52, 10], [996, 930, 64, -10]]
        : [[40, 120, 80, -15], [960, 140, 64, 12], [20, 900, 60, 10], [1000, 1000, 70, -10], [80, 1650, 70, 8], [930, 1700, 80, -12]];
  return [
    ...decor(e, spots),
    headline(e, { x: L.head[0], y: L.head[1], w: L.head[2], h: L.head[3] }, L.head[4]),
    kicker(e, { x: L.kick[0], y: L.kick[1], w: L.kick[2], h: L.kick[3] }, L.kick[4]),
    makeShape({ name: 'Картка товару', x: cx, y: cy, w: cw, h: ch, radius: 28, fill: { color: e.card }, shadow: { color: 'rgba(0,0,0,0.22)', blur: 30, x: 0, y: 14 } }),
    productPhoto(cx, cy, cw, ch),
    ...badge(e, cx + cw - 150, cy - 50, 200),
    ...(L.title ? [productTitle(e, { x: L.title[0], y: L.title[1], w: L.title[2], h: L.title[3] }, f === 'story' ? 40 : 36, e.ink)] : []),
    ...makePriceBlock({ x: 120, y: L.price, w: W - 240 }, 'row', { font: e.body, size: f === 'square' ? 58 : 62, accent: e.accent, color: e.ink, oldColor: e.sub }),
  ];
}

function frame(e0: Ev, f: F): Layer[] {
  const e = P(e0);
  const [W, H] = SIZE[f];
  const b = 34;
  const story = f === 'story';
  const ribbonY = story ? 1330 : H - (f === 'square' ? 250 : 270);
  const ribbonH = story ? 250 : f === 'square' ? 216 : 236;
  // in 9:16 the photo stops at the ribbon; below it is plain frame colour (Stories UI area)
  const photoH = story ? ribbonY + ribbonH - b : H - 2 * b;
  return [
    makeShape({ name: 'Рамка', x: 0, y: 0, w: W, h: H, fill: e.panel }),
    makeShape({ name: 'Фон фото', x: b, y: b, w: W - 2 * b, h: photoH, radius: 18, fill: { color: e.card } }),
    makeImage({ name: 'Фото товару', x: b, y: b, w: W - 2 * b, h: photoH, fit: 'smart', smart: { pad: 8, bg: 'card' }, radius: 18 }),
    T({ name: 'Мітка акції', text: e.kicker, x: 70, y: story ? 240 : 70, w: 700, h: 76, font: e.body, weight: 900, size: 32, minSize: 20, letterSpacing: 2, color: e.cta.fg, autoWidth: true, autoFit: true, maxLines: 1, bg: { color: e.cta.bg, radius: 8, padX: 26, padY: 0 } }),
    ...badge(e, W - 260, story ? 230 : 60, 200),
    makeShape({ name: 'Стрічка', x: b, y: ribbonY, w: W - 2 * b, h: ribbonH, radius: 18, fill: e.panel, shadow: { color: 'rgba(0,0,0,0.25)', blur: 24, x: 0, y: -4 } }),
    headline(e, { x: 80, y: ribbonY + 18, w: 560, h: ribbonH - 36 }, story ? 84 : 70, 'left'),
    ...makePriceBlock({ x: 620, y: ribbonY + Math.round(ribbonH / 2) - 70, w: W - 620 - 80 }, 'stack', { font: e.body, size: 54, accent: e.accent, color: e.ink, oldColor: e.sub, align: 'right' }),
  ];
}

const LAYOUTS: Record<LayoutId, { fn: (e: Ev, f: F) => Layer[]; label: string }> = {
  side: { fn: side, label: 'бічна панель' },
  top: { fn: top, label: 'заголовок зверху' },
  frame: { fn: frame, label: 'рамка' },
};

function build(e: Ev, l: LayoutId, f: F): DesignDoc {
  const [W, H] = SIZE[f];
  const layers = LAYOUTS[l].fn(e, f);
  layers.forEach((x, i) => (x.id = `e${i}`));
  return { width: W, height: H, background: l === 'top' ? { ...e.bg } : { color: e.card }, layers, format: { ...DEFAULT_FORMAT } };
}

export function eventTemplates(): BuiltinTemplate[] {
  const out: BuiltinTemplate[] = [];
  for (const e of EVENTS)
    for (const l of e.layouts)
      for (const f of ['portrait', 'square', 'story'] as F[])
        out.push({ id: `ev-${e.id}-${l}-${f}`, name: `${e.name} · ${LAYOUTS[l].label}`, formatId: f, doc: build(e, l, f), niches: ['event'] });
  return out;
}
