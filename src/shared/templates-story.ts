// Story (9:16) showcase templates — editorial ideas adapted to one product from the feed.
// Main photo = image_link, extra angles = additional_image_link[0..2] (shown only when the feed has them).
import type { Condition, DesignDoc, ImageLayer, Layer, ShapeLayer, TextLayer } from './types';
import { DEFAULT_FORMAT } from './types';
import { IF_DISCOUNT, IF_NO_DISCOUNT, makeIcon, makeImage, makePriceBlock, makeShape, makeText } from './layers';
import type { Niche } from './templates-lib';

const W = 1080;
const H = 1920;

const photo = (p: Partial<ImageLayer> & { pad?: number; mode?: 'card' | 'blend' }): ImageLayer => {
  const { pad = 6, mode = 'card', ...rest } = p;
  return makeImage({ name: 'Фото товару', fit: 'smart', smart: { pad, bg: mode }, ...rest });
};
const extra = (i: number, p: Partial<ImageLayer> & { pad?: number; mode?: 'card' | 'blend' }) =>
  photo({ name: `Фото ${i + 2}`, source: { kind: 'field', field: 'additional_image_link', index: i }, condition: imgs(i + 2), ...p });
const text = (p: Partial<TextLayer>) => makeText({ hideIfEmpty: true, ...p });
const shape = (p: Partial<ShapeLayer>) => makeShape(p);
/** show only when the product has at least n photos */
const imgs = (n: number): Condition => ({ action: 'show', mode: 'all', rules: [{ field: 'image_count', op: 'gte', value: String(n) }] });
const fewer = (n: number): Condition => ({ action: 'show', mode: 'all', rules: [{ field: 'image_count', op: 'lt', value: String(n) }] });
const disc = () => structuredClone(IF_DISCOUNT);
const nodisc = () => structuredClone(IF_NO_DISCOUNT);
const BRAND: Condition = { action: 'show', mode: 'all', rules: [{ field: 'brand', op: 'exists' }] };
const NOBRAND: Condition = { action: 'show', mode: 'all', rules: [{ field: 'brand', op: 'not_exists' }] };
const heart = (x: number, y: number, s = 40, color = '#E0242B') => makeIcon({ name: 'Серце', icon: 'heart', x, y, w: s, h: s, color, strokeWidth: 3.5, condition: imgs(2) } as any);

// ---------- 1. Hang tag ----------
function tag(): Layer[] {
  const tx = 230, ty = 380, tw = 620, th = 1130;
  const L: Layer[] = [
    // backdrop: the product photo itself, enlarged and softened
    photo({ name: 'Фон (фото)', x: -120, y: -120, w: W + 240, h: H + 240, fit: 'cover', blur: 34, opacity: 85 } as any),
    shape({ name: 'Вуаль', x: 0, y: 0, w: W, h: H, fill: { color: 'rgba(242,240,236,0.55)' } }),
    text({ name: 'Номер', text: '(01)', x: 90, y: 240, w: 300, h: 60, font: 'Inter', weight: 600, size: 40, color: '#1A1A1A', maxLines: 1 }),
    // second tag with an extra angle, peeking behind
    shape({ name: 'Бірка 2', x: 90, y: 640, w: 440, h: 860, radius: 40, rotation: -5, fill: { color: '#FFFFFF' }, shadow: { color: 'rgba(0,0,0,0.16)', blur: 40, x: 0, y: 18 }, condition: imgs(2) }),
    shape({ name: 'Бірка 2 — шийка', x: 230, y: 570, w: 160, h: 140, radius: 50, rotation: -5, fill: { color: '#FFFFFF' }, condition: imgs(2) }),
    extra(0, { x: 120, y: 720, w: 380, h: 700, rotation: -5, pad: 4 }),
    // main tag
    shape({ name: 'Бірка', x: tx, y: ty + 90, w: tw, h: th - 90, radius: 44, rotation: 3, fill: { color: '#FFFFFF' }, shadow: { color: 'rgba(0,0,0,0.2)', blur: 50, x: 0, y: 24 } }),
    shape({ name: 'Бірка — шийка', x: tx + tw / 2 - 110, y: ty, w: 220, h: 200, radius: 70, rotation: 3, fill: { color: '#FFFFFF' } }),
    shape({ name: 'Люверс', shape: 'ellipse', x: tx + tw / 2 - 30 + 5, y: ty + 40, w: 60, h: 60, rotation: 3, fill: { color: '#B9A26A', gradient: { from: '#E6D6A6', to: '#8F7843', angle: 135 } } }),
    shape({ name: 'Люверс — отвір', shape: 'ellipse', x: tx + tw / 2 - 16 + 5, y: ty + 54, w: 32, h: 32, rotation: 3, fill: { color: '#3B3428' } }),
    text({ name: 'Бренд вертикально', text: '{{brand|upper}}', x: tx - 210, y: ty + 330, w: 480, h: 50, rotation: -87, font: 'Inter', weight: 600, size: 28, letterSpacing: 6, color: '#2A2A2A', maxLines: 1, autoFit: true, minSize: 16 }),
    photo({ x: tx + 90, y: ty + 230, w: tw - 150, h: 600, rotation: 3, pad: 3, mode: 'blend' }),
    text({ name: 'Назва', text: '{{title|upper}}', x: tx + 60, y: ty + 860, w: tw - 110, h: 120, rotation: 3, font: 'Inter', weight: 600, size: 38, color: '#3A3A3A', align: 'center', maxLines: 2, autoFit: true, minSize: 24, lineHeight: 118 }),
    text({ name: 'Колір', text: '{{color|upper}}', x: tx + 60, y: ty + 985, w: tw - 110, h: 40, rotation: 3, font: 'Inter', weight: 500, size: 26, letterSpacing: 2, color: '#8C8C8C', align: 'center', maxLines: 1 }),
    ...makePriceBlock({ x: 90, y: 1600, w: 900 }, 'row', { font: 'Inter', size: 66, accent: '#C62828', color: '#141414', oldColor: '#8A8A8A', align: 'left' }),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: 760, y: 1600, w: 230, h: 84, font: 'Inter', weight: 700, size: 40, color: '#FFFFFF', align: 'right', autoWidth: true, maxLines: 1, bg: { color: '#141414', radius: 42, padX: 28, padY: 0 }, condition: disc() }),
  ];
  return L;
}

// ---------- 2. Kinetic type ----------
function kinetic(): Layer[] {
  const rows: Layer[] = [];
  const word = (i: number, cond: Condition, txt: string) => {
    const outline = i % 2 === 1;
    rows.push(
      text({
        name: outline ? 'Слово (контур)' : 'Слово',
        text: txt,
        x: -60,
        y: 340 + i * 240,
        w: W + 120,
        h: 240,
        font: 'Montserrat',
        weight: 900,
        size: 250,
        color: outline ? 'transparent' : '#0E0E0E',
        outline: outline ? { color: '#6B6B6B', width: 3 } : null,
        align: 'center',
        maxLines: 1,
        autoFit: true,
        minSize: 90,
        letterSpacing: -6,
        condition: cond,
      }),
    );
  };
  for (let i = 0; i < 4; i++) word(i, BRAND, '{{brand|upper}}');
  for (let i = 0; i < 4; i++) word(i, NOBRAND, i % 2 ? 'NEW IN' : 'SALE');
  return [
    text({ name: 'Надзаголовок', text: 'ЗНИЖКИ ТИЖНЯ', x: 0, y: 230, w: W, h: 60, font: 'Montserrat', weight: 600, size: 34, letterSpacing: 18, color: '#111111', align: 'center', maxLines: 1, condition: disc() }),
    text({ name: 'Надзаголовок (без знижки)', text: 'НОВЕ НАДХОДЖЕННЯ', x: 0, y: 230, w: W, h: 60, font: 'Montserrat', weight: 600, size: 34, letterSpacing: 14, color: '#111111', align: 'center', maxLines: 1, condition: nodisc() }),
    ...rows,
    // phone-like frame with the photo
    shape({ name: 'Рамка телефону', x: 300, y: 430, w: 480, h: 900, radius: 64, fill: { color: '#141414' }, shadow: { color: 'rgba(0,0,0,0.25)', blur: 40, x: 0, y: 20 } }),
    photo({ x: 316, y: 446, w: 448, h: 868, radius: 50, pad: 4 }),
    shape({ name: 'Камера', x: 470, y: 462, w: 140, h: 34, radius: 17, fill: { color: '#141414' } }),
    // floating chips
    shape({ name: 'Картка фото 2', x: 150, y: 760, w: 290, h: 290, radius: 40, fill: { color: '#FFFFFF' }, shadow: { color: 'rgba(0,0,0,0.18)', blur: 40, x: 0, y: 16 }, condition: imgs(2) }),
    extra(0, { x: 160, y: 770, w: 270, h: 270, radius: 34, pad: 6, mode: 'card' }),
    heart(380, 790, 36),
    shape({ name: 'Плашка знижки', x: 600, y: 920, w: 340, h: 108, radius: 54, fill: { color: '#FFFFFF' }, shadow: { color: 'rgba(0,0,0,0.18)', blur: 36, x: 0, y: 14 }, condition: disc() }),
    makeIcon({ name: 'Ярлик', icon: 'tag', x: 628, y: 948, w: 52, h: 52, color: '#C62828', strokeWidth: 2.5, condition: disc() } as any),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: 690, y: 920, w: 240, h: 108, font: 'Montserrat', weight: 800, size: 46, color: '#C62828', maxLines: 1, autoFit: true }),
    // bottom
    text({ name: 'Назва', text: '{{title}}', x: 90, y: 1410, w: 900, h: 70, font: 'Montserrat', weight: 600, size: 38, color: '#141414', align: 'center', maxLines: 1, autoFit: true, minSize: 26 }),
    ...makePriceBlock({ x: 90, y: 1490, w: 900 }, 'row', { font: 'Montserrat', size: 60, accent: '#C62828', color: '#141414', oldColor: '#8A8A8A', align: 'center' }),
    text({ name: 'Кнопка', text: 'КУПИТИ ЗАРАЗ', x: 340, y: 1600, w: 400, h: 86, font: 'Montserrat', weight: 600, size: 32, letterSpacing: 2, color: '#FFFFFF', align: 'center', autoWidth: true, maxLines: 1, bg: { color: '#C62828', radius: 4, padX: 40, padY: 0 } }),
  ];
}

// ---------- 3. Look builder (full photo + tiles with "+") ----------
function look(): Layer[] {
  const plus = (cx: number, cy: number) => [
    shape({ name: 'Плюс', shape: 'ellipse', x: cx - 28, y: cy - 28, w: 56, h: 56, fill: { color: 'rgba(255,255,255,0.85)' }, condition: imgs(2) }),
    makeIcon({ name: 'Плюс іконка', icon: 'plus', x: cx - 16, y: cy - 16, w: 32, h: 32, color: '#2A2A2A', strokeWidth: 3, condition: imgs(2) } as any),
  ];
  const tile = (i: number, x: number, y: number, w: number, h: number) => [
    shape({ name: `Плитка ${i + 2}`, x, y, w, h, radius: 34, fill: { color: '#FFFFFF' }, shadow: { color: 'rgba(0,0,0,0.18)', blur: 30, x: 0, y: 12 }, condition: imgs(i + 2) }),
    extra(i, { x: x + 10, y: y + 10, w: w - 20, h: h - 20, radius: 26, pad: 3 }),
  ];
  return [
    photo({ x: 0, y: 0, w: W, h: H, pad: 10 }),
    ...tile(0, 150, 640, 330, 470),
    ...tile(1, 600, 640, 330, 470),
    ...plus(540, 875),
    shape({ name: 'Панель', x: 90, y: 1300, w: 900, h: 260, radius: 44, fill: { color: 'rgba(255,255,255,0.88)' }, shadow: { color: 'rgba(0,0,0,0.12)', blur: 30, x: 0, y: 10 } }),
    text({ name: 'Бренд', text: '{{brand|upper}}', x: 140, y: 1330, w: 600, h: 44, font: 'Manrope', weight: 800, size: 26, letterSpacing: 4, color: '#8A6A55', maxLines: 1 }),
    text({ name: 'Назва', text: '{{title}}', x: 140, y: 1378, w: 800, h: 90, font: 'Manrope', weight: 600, size: 36, color: '#1E1E1E', maxLines: 2, autoFit: true, minSize: 24, vAlign: 'top' }),
    ...makePriceBlock({ x: 140, y: 1468, w: 600 }, 'row', { font: 'Manrope', size: 52, accent: '#B3261E', color: '#1E1E1E', oldColor: '#8A8A8A', align: 'left' }),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: 700, y: 1470, w: 240, h: 70, font: 'Manrope', weight: 800, size: 34, color: '#FFFFFF', align: 'right', autoWidth: true, maxLines: 1, bg: { color: '#B3261E', radius: 35, padX: 24, padY: 0 }, condition: disc() }),
  ];
}

// ---------- 4. Editorial collage with details column ----------
function collage(): Layer[] {
  const col = (i: number, y: number) => extra(i, { x: 700, y, w: 320, h: 380, fit: 'cover', pad: 0 });
  return [
    photo({ x: 0, y: 160, w: 680, h: 1240, pad: 4, condition: imgs(2) }),
    photo({ name: 'Фото (одне)', x: 60, y: 160, w: 960, h: 1240, pad: 4, condition: fewer(2) }),
    shape({ name: 'Колонка фон', x: 700, y: 160, w: 320, h: 1240, fill: { color: '#E7E5E2' }, condition: imgs(2) }),
    col(0, 160),
    col(1, 590),
    col(2, 1020),
    text({ name: 'Назва', text: '{{title}}', x: 70, y: 1440, w: 900, h: 60, font: 'Inter', weight: 400, size: 38, color: '#2A2A2A', maxLines: 1, autoFit: true, minSize: 24 }),
    text({ name: 'Артикул', text: '{{id|upper}}', x: 70, y: 1500, w: 600, h: 50, font: 'Inter', weight: 700, size: 34, color: '#141414', maxLines: 1 }),
    ...makePriceBlock({ x: 520, y: 1488, w: 490 }, 'row', { font: 'Inter', size: 50, accent: '#B3261E', color: '#141414', oldColor: '#8A8A8A', align: 'right' }),
    text({ name: 'Знижка %', text: 'SALE −{{discount_percent}}%', x: 70, y: 230, w: 400, h: 64, font: 'Inter', weight: 700, size: 28, letterSpacing: 2, color: '#FFFFFF', autoWidth: true, maxLines: 1, bg: { color: '#141414', radius: 0, padX: 22, padY: 0 }, condition: disc() }),
  ];
}

// ---------- 5. iOS action sheet ----------
function sheet(): Layer[] {
  const cell = 352, gap = 12;
  const L: Layer[] = [];
  // 3×4 grid: main photo and extra angles repeated
  const srcs = ['main', 0, 1, 0, 'main', 1, 'main', 0, 2, 1, 'main', 0] as const;
  srcs.forEach((s, k) => {
    const x = (k % 3) * (cell + gap);
    const y = Math.floor(k / 3) * (cell * 1.32 + gap);
    const box = { x, y, w: cell, h: Math.round(cell * 1.32) };
    L.push(shape({ name: 'Клітинка', ...box, fill: { color: '#BDBDBD' } }));
    L.push(photo({ ...box, pad: 4 }));
    if (s !== 'main') L.push(photo({ name: `Фото ${s + 2}`, ...box, pad: 4, source: { kind: 'field', field: 'additional_image_link', index: s } }));
    L.push(shape({ name: 'Галочка', shape: 'ellipse', x: x + cell - 74, y: y + box.h - 74, w: 52, h: 52, fill: { color: 'rgba(60,60,60,0.85)' }, stroke: { color: '#FFFFFF', width: 3 } }));
    L.push(makeIcon({ name: 'Галочка іконка', icon: 'check', x: x + cell - 62, y: y + box.h - 62, w: 28, h: 28, color: '#FFFFFF', strokeWidth: 3 } as any));
  });
  L.push(shape({ name: 'Затемнення', x: 0, y: 0, w: W, h: H, fill: { color: 'rgba(0,0,0,0.32)' } }));
  L.push(text({ name: 'Заголовок', text: 'Обране', x: 70, y: 230, w: 500, h: 90, font: 'Inter', weight: 700, size: 64, color: '#FFFFFF', maxLines: 1 }));
  // the sheet
  L.push(shape({ name: 'Аркуш', x: 50, y: 1180, w: 980, h: 300, radius: 36, fill: { color: 'rgba(242,242,242,0.97)' } }));
  L.push(text({ name: 'Повідомлення', text: '«{{title}}» додано в обране', x: 100, y: 1205, w: 880, h: 120, font: 'Inter', weight: 400, size: 32, color: '#6F6F6F', align: 'center', vAlign: 'middle', maxLines: 3, autoFit: true, minSize: 22 }));
  L.push(shape({ name: 'Роздільник', x: 50, y: 1345, w: 980, h: 2, fill: { color: '#D5D5D5' } }));
  L.push(text({ name: 'Акція', text: 'ЗНИЖКА −{{discount_percent}}%', x: 50, y: 1350, w: 980, h: 128, font: 'Inter', weight: 700, size: 52, color: '#D93B35', align: 'center', vAlign: 'middle', maxLines: 1, condition: disc() }));
  L.push(text({ name: 'Ціна (без знижки)', text: '{{current_price_fmt}}', x: 50, y: 1350, w: 980, h: 128, font: 'Inter', weight: 700, size: 52, color: '#1A1A1A', align: 'center', vAlign: 'middle', maxLines: 1, condition: nodisc() }));
  L.push(shape({ name: 'Кнопка', x: 50, y: 1500, w: 980, h: 130, radius: 36, fill: { color: '#FFFFFF' } }));
  L.push(text({ name: 'Кнопка текст', text: 'Купити за {{current_price_fmt}}', x: 50, y: 1500, w: 980, h: 130, font: 'Inter', weight: 500, size: 46, color: '#1F6FE5', align: 'center', vAlign: 'middle', maxLines: 1, autoFit: true, minSize: 30 }));
  return L;
}

// ---------- 6. Lifestyle grid + product card ----------
function grid(): Layer[] {
  const cw = W / 2, ch = H / 2;
  const cells: [number, number, 'main' | number][] = [
    [0, 0, 0],
    [cw, 0, 1],
    [0, ch, 2],
    [cw, ch, 'main'],
  ];
  const L: Layer[] = [];
  const tones = ['#D9CFC4', '#C9C2BA', '#E1D8CE', '#CFC6BC'];
  cells.forEach(([x, y, s], i) => {
    L.push(shape({ name: 'Клітинка', x, y, w: cw, h: ch, fill: { color: tones[i] } }));
    L.push(photo({ name: 'Фото (сітка)', x, y, w: cw, h: ch, fit: 'cover', pad: 0, opacity: s === 'main' ? 100 : 70 } as any));
    if (s !== 'main') L.push(photo({ name: `Фото ${s + 2} (сітка)`, x, y, w: cw, h: ch, fit: 'cover', pad: 0, source: { kind: 'field', field: 'additional_image_link', index: s } }));
  });
  L.push(
    shape({ name: 'Картка', x: 250, y: 610, w: 580, h: 700, radius: 22, fill: { color: '#FFFFFF' }, shadow: { color: 'rgba(0,0,0,0.22)', blur: 50, x: 0, y: 20 } }),
    text({ name: 'Підпис', text: 'Також є в інших кольорах', x: 300, y: 650, w: 480, h: 40, font: 'Montserrat', weight: 400, size: 24, color: '#6A6A6A', maxLines: 1 }),
    photo({ x: 290, y: 710, w: 500, h: 330, mode: 'blend', pad: 2 }),
    text({ name: 'Назва', text: '{{title|upper}}', x: 300, y: 1060, w: 480, h: 70, font: 'Montserrat', weight: 500, size: 28, color: '#2A2A2A', maxLines: 2, autoFit: true, minSize: 20, lineHeight: 115 }),
    ...makePriceBlock({ x: 300, y: 1140, w: 480 }, 'row', { font: 'Montserrat', size: 40, accent: '#C62828', color: '#141414', oldColor: '#8A8A8A', align: 'left' }),
    text({ name: 'Розміри', text: 'Розміри: {{size}}', x: 300, y: 1236, w: 480, h: 40, font: 'Montserrat', weight: 400, size: 24, color: '#6A6A6A', maxLines: 1 }),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: 650, y: 630, w: 160, h: 56, font: 'Montserrat', weight: 800, size: 28, color: '#FFFFFF', align: 'right', autoWidth: true, maxLines: 1, bg: { color: '#C62828', radius: 28, padX: 18, padY: 0 }, condition: disc() }),
  );
  return L;
}

// ---------- 7. Outfit receipt ----------
function receipt(): Layer[] {
  const px = 140, pw = 800;
  const bars: Layer[] = [];
  // deterministic barcode
  let x = px + 60;
  let seed = 7;
  while (x < px + pw - 70) {
    seed = (seed * 9301 + 49297) % 233280;
    const w = 3 + (seed % 4) * 3;
    bars.push(shape({ name: 'Штрихкод', x, y: 1560, w, h: 120, fill: { color: '#1A1A1A' } }));
    x += w + 4 + ((seed >> 3) % 3) * 3;
  }
  const dash = (y: number) => text({ name: 'Пунктир', text: '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', x: px + 40, y, w: pw - 80, h: 30, font: 'Inter', weight: 400, size: 26, color: '#8C8C8C', maxLines: 1 });
  return [
    shape({ name: 'Принтер', x: 90, y: 0, w: 900, h: 120, radius: 30, fill: { color: '#2B2B2B', gradient: { from: '#3A3A3A', to: '#1C1C1C', angle: 180 } } }),
    shape({ name: 'Стрічка', x: px, y: 90, w: pw, h: 1830, fill: { color: '#F6F3EC' }, shadow: { color: 'rgba(0,0,0,0.15)', blur: 30, x: 0, y: 8 } }),
    text({ name: 'Заголовок', text: 'ВАШ ЧЕК', x: px, y: 230, w: pw, h: 140, font: 'Oswald', weight: 700, size: 120, color: '#1A1A1A', align: 'center', maxLines: 1 }),
    dash(380),
    photo({ x: px + 40, y: 430, w: pw - 80, h: 640, mode: 'blend', pad: 4 }),
    text({ name: 'Знижка %', text: '−{{discount_percent}}%', x: px + 60, y: 450, w: 260, h: 70, font: 'Oswald', weight: 700, size: 40, color: '#F6F3EC', autoWidth: true, maxLines: 1, bg: { color: '#1A1A1A', radius: 0, padX: 20, padY: 0 }, condition: disc() }),
    dash(1090),
    text({ name: 'Бренд', text: '✦  {{brand|upper}}  ✦', x: px, y: 1130, w: pw, h: 50, font: 'Inter', weight: 700, size: 32, letterSpacing: 6, color: '#1A1A1A', align: 'center', maxLines: 1 }),
    text({ name: 'Крапки', text: '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .', x: px + 60, y: 1218, w: pw - 120, h: 40, font: 'Inter', size: 26, color: '#9A9A9A', maxLines: 1 }),
    text({ name: 'Назва', text: '• {{title|upper}}', x: px + 60, y: 1206, w: 470, h: 50, font: 'Inter', weight: 500, size: 28, color: '#1A1A1A', maxLines: 1, autoWidth: true, autoFit: true, minSize: 20, bg: { color: '#F6F3EC', radius: 0, padX: 6, padY: 0 } }),
    text({ name: 'Ціна', text: '{{current_price_fmt}}', x: px + pw - 300, y: 1206, w: 240, h: 50, font: 'Inter', weight: 700, size: 30, color: '#1A1A1A', align: 'right', autoWidth: true, maxLines: 1, bg: { color: '#F6F3EC', radius: 0, padX: 6, padY: 0 } }),
    text({ name: 'Стара ціна', text: 'Було {{old_price_fmt}}', x: px + 60, y: 1270, w: pw - 120, h: 44, font: 'Inter', weight: 400, size: 26, color: '#8C8C8C', align: 'right', maxLines: 1, decoration: 'none' }),
    text({ name: 'Колір / розмір', text: '• {{color|upper}}', x: px + 60, y: 1270, w: 400, h: 44, font: 'Inter', weight: 400, size: 26, color: '#5A5A5A', maxLines: 1 }),
    dash(1340),
    text({ name: 'Разом', text: 'РАЗОМ', x: px + 60, y: 1390, w: 300, h: 80, font: 'Oswald', weight: 700, size: 56, color: '#1A1A1A', maxLines: 1 }),
    text({ name: 'Разом сума', text: '{{current_price_fmt}}', x: px + pw - 460, y: 1390, w: 400, h: 80, font: 'Oswald', weight: 700, size: 56, color: '#1A1A1A', align: 'right', maxLines: 1 }),
    dash(1490),
    ...bars,
    text({ name: 'Дякуємо', text: 'ДЯКУЄМО ЗА СТИЛЬ', x: px, y: 1700, w: pw, h: 40, font: 'Inter', weight: 500, size: 24, letterSpacing: 8, color: '#5A5A5A', align: 'center', maxLines: 1 }),
  ];
}

// ---------- 8. Sale tag on a motion background ----------
function saleTag(): Layer[] {
  const tx = 230, ty = 330, tw = 620, th = 1300;
  return [
    photo({ name: 'Фон (фото)', x: -200, y: -200, w: W + 400, h: H + 400, fit: 'cover', blur: 50 } as any),
    shape({ name: 'Затемнення', x: 0, y: 0, w: W, h: H, fill: { color: 'rgba(15,15,18,0.62)' } }),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => shape({ name: 'Смуга', x: 0, y: 140 + i * 260, w: W, h: 70, fill: { color: 'rgba(255,255,255,0.05)' }, blur: 18 })),
    shape({ name: 'Шнурок 1', x: tx + tw / 2 - 40, y: 0, w: 5, h: ty + 150, rotation: -6, fill: { color: '#E9E6DF' } }),
    shape({ name: 'Шнурок 2', x: tx + tw / 2 + 36, y: 0, w: 5, h: ty + 150, rotation: 6, fill: { color: '#D8D4CC' } }),
    shape({ name: 'Бірка', x: tx, y: ty, w: tw, h: th, radius: 18, fill: { color: '#F4F2EE' }, shadow: { color: 'rgba(0,0,0,0.45)', blur: 60, x: 0, y: 30 } }),
    shape({ name: 'Отвір', shape: 'ellipse', x: tx + tw / 2 - 90, y: ty + 70, w: 180, h: 180, fill: { color: '#2A2A2E' } }),
    text({ name: 'Sale', text: 'Sale', x: tx, y: ty + 290, w: tw, h: 170, font: 'Inter', weight: 700, size: 170, letterSpacing: -6, color: '#1A1A1A', align: 'center', maxLines: 1, condition: disc() }),
    text({ name: 'New', text: 'New', x: tx, y: ty + 290, w: tw, h: 170, font: 'Inter', weight: 700, size: 170, letterSpacing: -6, color: '#1A1A1A', align: 'center', maxLines: 1, condition: nodisc() }),
    text({ name: 'Знижка від руки', text: '−{{discount_percent}}%', x: tx, y: ty + 460, w: tw, h: 110, rotation: -4, font: 'Caveat', weight: 700, size: 104, color: '#1A1A1A', align: 'center', maxLines: 1 }),
    text({ name: 'Ціна від руки', text: '{{current_price_fmt}}', x: tx, y: ty + 460, w: tw, h: 110, rotation: -4, font: 'Caveat', weight: 700, size: 90, color: '#1A1A1A', align: 'center', maxLines: 1, condition: nodisc() }),
    photo({ x: tx + 60, y: ty + 600, w: tw - 120, h: 520, mode: 'blend', pad: 2 }),
    ...makePriceBlock({ x: tx + 40, y: ty + 1150, w: tw - 80 }, 'row', { font: 'Inter', size: 48, accent: '#1A1A1A', color: '#1A1A1A', oldColor: '#8A8A8A', align: 'center' }),
    text({ name: 'Бренд', text: '{{brand|lower}}', x: 0, y: 1700, w: W, h: 60, font: 'Inter', weight: 700, size: 36, color: '#FFFFFF', align: 'center', maxLines: 1 }),
  ];
}

// ---------- 9. Street poster ----------
function poster(): Layer[] {
  return [
    shape({ name: 'Стіна', x: 0, y: 0, w: W, h: H, fill: { color: '#D9D6CF', gradient: { from: '#E4E1DA', to: '#C7C3BA', angle: 160 } } }),
    shape({ name: 'Шов', x: 0, y: 1660, w: W, h: 6, fill: { color: 'rgba(0,0,0,0.08)' } }),
    shape({ name: 'Постер', x: 130, y: 300, w: 820, h: 1180, rotation: -1.5, fill: { color: '#FBFBF9' }, shadow: { color: 'rgba(0,0,0,0.22)', blur: 26, x: 6, y: 12 } }),
    shape({ name: 'Скотч 1', x: 100, y: 270, w: 200, h: 60, rotation: -30, opacity: 70, fill: { color: '#EDE7D2' } }),
    shape({ name: 'Скотч 2', x: 790, y: 270, w: 200, h: 60, rotation: 28, opacity: 70, fill: { color: '#EDE7D2' } }),
    text({ name: 'Заголовок', text: 'ТИ ВЖЕ БАЧИВ ЦЮ РІЧ?', x: 170, y: 350, w: 740, h: 220, rotation: -1.5, font: 'Inter', weight: 800, size: 84, color: '#0E0E0E', align: 'center', vAlign: 'middle', maxLines: 2, autoFit: true, minSize: 50, lineHeight: 100 }),
    photo({ x: 190, y: 590, w: 700, h: 640, rotation: -1.5, mode: 'blend', pad: 3 }),
    text({ name: 'Знижка', text: 'МІНУС {{discount_percent}}% — ВСТИГНИ', x: 170, y: 1250, w: 740, h: 180, rotation: -1.5, font: 'Inter', weight: 800, size: 64, color: '#0E0E0E', align: 'center', vAlign: 'middle', maxLines: 2, autoFit: true, minSize: 40, condition: disc() }),
    text({ name: 'Ціна (без знижки)', text: 'ВЖЕ ОНЛАЙН · {{current_price_fmt}}', x: 170, y: 1250, w: 740, h: 180, rotation: -1.5, font: 'Inter', weight: 800, size: 60, color: '#0E0E0E', align: 'center', vAlign: 'middle', maxLines: 2, autoFit: true, minSize: 40, condition: nodisc() }),
    text({ name: 'Бренд', text: '{{brand|upper}}', x: 80, y: 200, w: 500, h: 60, font: 'Inter', weight: 800, size: 40, letterSpacing: 3, color: '#0E0E0E', maxLines: 1 }),
    text({ name: 'Ціна', text: '{{current_price_fmt}}', x: 0, y: 1530, w: W, h: 80, font: 'Inter', weight: 800, size: 56, color: '#0E0E0E', align: 'center', maxLines: 1, condition: disc() }),
  ];
}

// ---------- 10. Levitation ----------
function levitate(): Layer[] {
  return [
    shape({ name: 'Фон', x: 0, y: 0, w: W, h: H, fill: { color: '#E6E7E9', gradient: { from: '#EEEFF1', to: '#D9DADD', angle: 180 } } }),
    shape({ name: 'Тінь', shape: 'ellipse', x: 290, y: 1290, w: 500, h: 70, fill: { color: 'rgba(0,0,0,0.28)' }, blur: 28 }),
    photo({ x: 160, y: 380, w: 760, h: 820, mode: 'blend', pad: 2 }),
    text({ name: 'Знижка', text: '−{{discount_percent}}%', x: 0, y: 250, w: W, h: 80, font: 'Inter', weight: 500, size: 44, letterSpacing: 8, color: '#C62828', align: 'center', maxLines: 1, condition: disc() }),
    text({ name: 'Назва', text: '{{title}}', x: 120, y: 1400, w: 840, h: 140, font: 'Inter', weight: 400, size: 60, color: '#141414', align: 'center', vAlign: 'top', maxLines: 2, autoFit: true, minSize: 36, letterSpacing: -1, lineHeight: 112 }),
    ...makePriceBlock({ x: 120, y: 1540, w: 840 }, 'row', { font: 'Inter', size: 40, accent: '#C62828', color: '#3A3A3A', oldColor: '#9A9A9A', align: 'center' }),
    text({ name: 'Бренд', text: '{{brand}}', x: 0, y: 1640, w: W, h: 40, font: 'Inter', weight: 500, size: 22, letterSpacing: 2, color: '#7A7A7A', align: 'center', maxLines: 1 }),
  ];
}

interface StoryEntry {
  key: string;
  name: string;
  hint: string;
  niches: Niche[];
  bg: string;
  layers: () => Layer[];
}

const STORIES: StoryEntry[] = [
  { key: 'tag', name: 'Бірка', hint: 'Товар на бірці з люверсом поверх розмитого фото; друга бірка — додатковий ракурс', niches: ['fashion', 'beauty', 'jewelry'], bg: '#F2F0EC', layers: tag },
  { key: 'kinetic', name: 'Кінетичний шрифт', hint: 'Бренд великими рядками (заливка/контур), фото в рамці телефону, плашки знижки', niches: ['fashion', 'sale', 'sport'], bg: '#FFFFFF', layers: kinetic },
  { key: 'look', name: 'Збери образ', hint: 'Фото на весь екран + ракурси на плитках із «+»', niches: ['fashion', 'beauty'], bg: '#EDEDED', layers: look },
  { key: 'collage', name: 'Колаж з деталями', hint: 'Велике фото + колонка ракурсів, назва й артикул', niches: ['fashion', 'home'], bg: '#ECEAE7', layers: collage },
  { key: 'sheet', name: 'Меню iPhone', hint: 'Сітка фото як у галереї та системне вікно «Купити»', niches: ['fashion', 'sale', 'tech'], bg: '#9E9E9E', layers: sheet },
  { key: 'grid', name: 'Лайфстайл + картка', hint: 'Чотири фото з фіду та біла картка товару по центру', niches: ['fashion', 'sport', 'home'], bg: '#D9CFC4', layers: grid },
  { key: 'receipt', name: 'Чек', hint: 'Товар у паперовому чеку зі штрихкодом', niches: ['fashion', 'sale', 'home'], bg: '#DCDAD5', layers: receipt },
  { key: 'saletag', name: 'Цінник Sale', hint: 'Підвісний цінник з відсотком «від руки» на темному фоні', niches: ['sale', 'fashion', 'jewelry'], bg: '#18181B', layers: saleTag },
  { key: 'poster', name: 'Постер на стіні', hint: 'Афіша «Ти вже бачив цю річ?» на скотчі', niches: ['fashion', 'tech', 'sale'], bg: '#D9D6CF', layers: poster },
  { key: 'levitate', name: 'Левітація', hint: 'Товар «висить» над м’якою тінню, мінімум тексту', niches: ['fashion', 'beauty', 'home', 'tech', 'jewelry'], bg: '#E6E7E9', layers: levitate },
];

export function storyTemplates() {
  return STORIES.map((e) => {
    const layers = e.layers();
    layers.forEach((l, i) => (l.id = `s${i}`));
    const doc: DesignDoc = { width: W, height: H, background: { color: e.bg }, layers, format: { ...DEFAULT_FORMAT } };
    return { id: `story-${e.key}`, name: e.name, formatId: 'story' as const, niches: e.niches, hint: e.hint, doc };
  });
}
