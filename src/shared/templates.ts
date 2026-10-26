// Built-in design templates per ad format. Text uses feed variables; discount elements
// appear only for products with a discount (condition + hide-if-empty).
import type { DesignDoc, Layer } from './types';
import { DEFAULT_FORMAT } from './types';
import { IF_DISCOUNT, IF_NO_DISCOUNT, makeIcon, makeImage, makeShape, makeText } from './layers';

export interface BuiltinTemplate {
  id: string;
  name: string;
  formatId: 'square' | 'portrait' | 'story' | 'landscape';
  doc: DesignDoc;
}

function doc(w: number, h: number, bg: DesignDoc['background'], layers: Layer[]): DesignDoc {
  // stable ids so templates are deterministic
  layers.forEach((l, i) => (l.id = `t${i}`));
  return { width: w, height: h, background: bg, layers, format: { ...DEFAULT_FORMAT } };
}

const RED = '#E53935';

function cornerSquare(): DesignDoc {
  const feature = (y: number, icon: string, text: string): Layer[] => [
    makeShape({ name: 'Плашка', x: 730, y, w: 320, h: 110, radius: 22, fill: { color: '#ffffff' }, stroke: { color: '#E6E6E8', width: 2 } }),
    makeIcon({ name: 'Іконка', icon, x: 752, y: y + 27, w: 56, h: 56, color: '#111111', strokeWidth: 1.6 }),
    makeText({ name: 'Перевага', text, x: 824, y, w: 210, h: 110, font: 'Montserrat', weight: 700, size: 25, lineHeight: 115, maxLines: 3, autoFit: true }),
  ];
  return doc(1080, 1080, { color: '#ffffff' }, [
    makeShape({ name: 'Фон товару', x: 0, y: 0, w: 700, h: 1080, fill: { color: '#EDEDEF' } }),
    makeImage({ name: 'Фото товару', x: 30, y: 120, w: 640, h: 840 }),
    makeShape({ name: 'Кут знижки', shape: 'triangle', corner: 'tl', x: 0, y: 0, w: 300, h: 300, fill: { color: RED }, condition: IF_DISCOUNT }),
    makeText({ name: 'Знижка %', text: '-{{discount_percent}}%', x: -35, y: 60, w: 260, h: 70, rotation: -45, font: 'Montserrat', weight: 800, size: 54, color: '#ffffff', align: 'center' }),
    makeText({ name: 'Бренд', text: '{{brand|upper}}', x: 720, y: 70, w: 340, h: 150, font: 'Montserrat', weight: 800, size: 46, align: 'center', maxLines: 2, autoFit: true, lineHeight: 105 }),
    ...feature(290, 'globe', '100% оригінал'),
    ...feature(420, 'truck', 'Відправка протягом 24 годин'),
    ...feature(550, 'badge-percent', 'Знижки на обрані позиції'),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 710, y: 800, w: 360, h: 60, font: 'Inter', size: 36, color: '#9E9E9E', align: 'center', decoration: 'line-through' }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 710, y: 860, w: 360, h: 110, font: 'Inter', weight: 800, size: 68, color: RED, align: 'center', autoFit: true, maxLines: 1 }),
  ]);
}

function minimalSquare(): DesignDoc {
  return doc(1080, 1080, { color: '#F5F5F7' }, [
    makeImage({ name: 'Фото товару', x: 90, y: 50, w: 900, h: 730 }),
    makeText({ name: 'Назва', text: '{{title}}', x: 80, y: 795, w: 920, h: 120, font: 'Manrope', weight: 700, size: 44, vAlign: 'top', maxLines: 2, lineHeight: 125 }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 80, y: 935, w: 520, h: 96, font: 'Manrope', weight: 800, size: 50, color: '#ffffff', autoWidth: true, bg: { color: '#111111', radius: 48, padX: 40, padY: 0 } }),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 600, y: 935, w: 400, h: 96, font: 'Manrope', weight: 500, size: 40, color: '#8A8A8E', align: 'right', decoration: 'line-through' }),
    makeShape({ name: 'Бейдж', shape: 'burst', points: 18, x: 850, y: 30, w: 200, h: 200, fill: { color: RED }, condition: IF_DISCOUNT }),
    makeText({ name: 'Знижка %', text: '-{{discount_percent}}%', x: 850, y: 30, w: 200, h: 200, rotation: 12, font: 'Manrope', weight: 800, size: 54, color: '#ffffff', align: 'center' }),
  ]);
}

function saleSquare(): DesignDoc {
  return doc(1080, 1080, { color: '#FF3D3D', gradient: { from: '#FF2E4D', to: '#FF8A00', angle: 135 } }, [
    makeShape({ name: 'Картка', x: 60, y: 60, w: 960, h: 790, radius: 40, fill: { color: '#ffffff' }, shadow: { color: 'rgba(0,0,0,0.18)', blur: 30, x: 0, y: 12 } }),
    makeImage({ name: 'Фото товару', x: 110, y: 110, w: 860, h: 700 }),
    makeText({ name: 'Знижка %', text: '-{{discount_percent}}%', x: 90, y: 90, w: 300, h: 84, font: 'Rubik', weight: 800, size: 46, color: '#ffffff', autoWidth: true, bg: { color: '#111111', radius: 18, padX: 26, padY: 0 } }),
    makeText({ name: 'Назва', text: '{{title}}', x: 60, y: 875, w: 600, h: 160, font: 'Rubik', weight: 600, size: 38, color: '#ffffff', maxLines: 3, autoFit: true, lineHeight: 118 }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 660, y: 880, w: 360, h: 90, font: 'Rubik', weight: 800, size: 62, color: '#ffffff', align: 'right', autoFit: true, maxLines: 1 }),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 660, y: 970, w: 360, h: 56, font: 'Rubik', weight: 500, size: 34, color: '#FFE0D6', align: 'right', decoration: 'line-through' }),
  ]);
}

function priceCircleSquare(): DesignDoc {
  return doc(1080, 1080, { color: '#ffffff' }, [
    makeImage({ name: 'Фото товару', x: 0, y: 0, w: 1080, h: 1080, fit: 'cover' }),
    makeShape({ name: 'Коло ціни', shape: 'ellipse', x: 770, y: 770, w: 270, h: 270, fill: { color: RED }, shadow: { color: 'rgba(0,0,0,0.25)', blur: 24, x: 0, y: 8 } }),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 790, y: 820, w: 230, h: 50, font: 'Montserrat', weight: 500, size: 30, color: '#FFD3D1', align: 'center', decoration: 'line-through' }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 790, y: 860, w: 230, h: 90, font: 'Montserrat', weight: 800, size: 46, color: '#ffffff', align: 'center', autoFit: true, maxLines: 1 }),
    makeText({ name: 'Бренд', text: '{{brand|upper}}', x: 40, y: 40, w: 600, h: 70, font: 'Montserrat', weight: 800, size: 34, letterSpacing: 4, color: '#111111', autoWidth: true, bg: { color: '#ffffff', radius: 8, padX: 22, padY: 0 } }),
  ]);
}

function bannerPortrait(): DesignDoc {
  const PINK = '#E0115F';
  return doc(1080, 1350, { color: '#ffffff' }, [
    makeText({ name: 'Бренд', text: '{{brand|upper}}', x: 60, y: 45, w: 640, h: 80, font: 'Playfair Display', weight: 700, size: 48, color: PINK }),
    makeText({ name: 'Знижка %', text: '-{{discount_percent}}%', x: 700, y: 45, w: 320, h: 80, font: 'Inter', weight: 800, size: 40, color: '#ffffff', align: 'right', autoWidth: true, bg: { color: PINK, radius: 40, padX: 30, padY: 0 } }),
    makeImage({ name: 'Фото товару', x: 90, y: 150, w: 900, h: 800 }),
    makeShape({ name: 'Смуга', x: 0, y: 980, w: 1080, h: 370, fill: { color: '#BFE0F5' } }),
    makeText({ name: 'Заголовок', text: '{{title|first_word}}', x: 60, y: 1020, w: 560, h: 120, font: 'Playfair Display', italic: true, weight: 700, size: 84, color: PINK, autoFit: true, maxLines: 1 }),
    makeText({ name: 'Назва', text: '{{title}}', x: 60, y: 1150, w: 560, h: 110, font: 'Inter', size: 30, color: '#333333', vAlign: 'top', maxLines: 2 }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 620, y: 1060, w: 400, h: 120, font: 'Inter', weight: 800, size: 56, color: '#ffffff', align: 'right', autoWidth: true, bg: { color: PINK, radius: 14, padX: 32, padY: 0 } }),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 620, y: 1190, w: 400, h: 56, font: 'Inter', size: 34, color: '#4A4A4A', align: 'right', decoration: 'line-through' }),
  ]);
}

function darkPortrait(): DesignDoc {
  const GOLD = '#C9A86A';
  return doc(1080, 1350, { color: '#0E0E10' }, [
    makeShape({ name: 'Картка', x: 60, y: 60, w: 960, h: 900, radius: 32, fill: { color: '#1C1C21', gradient: { from: '#26262C', to: '#141417', angle: 180 } } }),
    makeImage({ name: 'Фото товару', x: 100, y: 100, w: 880, h: 820 }),
    makeText({ name: 'Знижка %', text: '−{{discount_percent}}%', x: 100, y: 100, w: 260, h: 72, font: 'Montserrat', weight: 800, size: 36, color: '#0E0E10', autoWidth: true, bg: { color: GOLD, radius: 4, padX: 22, padY: 0 } }),
    makeText({ name: 'Бренд', text: '{{brand|upper}}', x: 60, y: 995, w: 960, h: 60, font: 'Montserrat', weight: 600, size: 30, letterSpacing: 8, color: GOLD, align: 'center' }),
    makeText({ name: 'Назва', text: '{{title}}', x: 100, y: 1060, w: 880, h: 110, font: 'Playfair Display', size: 44, color: '#ffffff', align: 'center', maxLines: 2, autoFit: true, lineHeight: 115 }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 60, y: 1180, w: 960, h: 90, font: 'Montserrat', weight: 700, size: 58, color: '#ffffff', align: 'center' }),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 60, y: 1268, w: 960, h: 50, font: 'Montserrat', size: 30, color: '#8B8B90', align: 'center', decoration: 'line-through' }),
  ]);
}

function saleStory(): DesignDoc {
  const Y = '#FFD60A';
  return doc(1080, 1920, { color: '#111111', gradient: { from: '#14112B', to: '#3A0CA3', angle: 160 } }, [
    makeText({ name: 'Розпродаж', text: 'РОЗПРОДАЖ', x: 60, y: 250, w: 960, h: 110, font: 'Unbounded', weight: 900, size: 86, color: '#ffffff', align: 'center', autoFit: true, condition: IF_DISCOUNT }),
    makeText({ name: 'Бренд (без знижки)', text: '{{brand|upper}}', x: 60, y: 250, w: 960, h: 110, font: 'Unbounded', weight: 900, size: 76, color: '#ffffff', align: 'center', autoFit: true, maxLines: 1, condition: IF_NO_DISCOUNT }),
    makeText({ name: 'Знижка %', text: '-{{discount_percent}}%', x: 60, y: 365, w: 960, h: 160, font: 'Unbounded', weight: 900, size: 140, color: Y, align: 'center' }),
    makeShape({ name: 'Картка', x: 110, y: 560, w: 860, h: 760, radius: 48, fill: { color: '#ffffff' } }),
    makeImage({ name: 'Фото товару', x: 150, y: 595, w: 780, h: 690 }),
    makeText({ name: 'Назва', text: '{{title}}', x: 80, y: 1345, w: 920, h: 130, font: 'Manrope', weight: 700, size: 46, color: '#ffffff', align: 'center', maxLines: 2, autoFit: true }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 80, y: 1480, w: 920, h: 100, font: 'Manrope', weight: 800, size: 78, color: Y, align: 'center' }),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 80, y: 1580, w: 920, h: 60, font: 'Manrope', weight: 500, size: 40, color: '#B9B5D6', align: 'center', decoration: 'line-through' }),
  ]);
}

function minimalStory(): DesignDoc {
  return doc(1080, 1920, { color: '#F3EFE8' }, [
    makeText({ name: 'Бренд', text: '{{brand|upper}}', x: 60, y: 250, w: 960, h: 80, font: 'Montserrat', weight: 700, size: 40, letterSpacing: 10, color: '#111111', align: 'center' }),
    makeImage({ name: 'Фото товару', x: 60, y: 370, w: 960, h: 960 }),
    makeText({ name: 'Знижка %', text: '-{{discount_percent}}%', x: 760, y: 380, w: 260, h: 90, font: 'Montserrat', weight: 800, size: 44, color: '#ffffff', align: 'right', autoWidth: true, bg: { color: RED, radius: 45, padX: 30, padY: 0 } }),
    makeText({ name: 'Назва', text: '{{title}}', x: 80, y: 1350, w: 920, h: 130, font: 'Lora', weight: 500, size: 50, color: '#111111', align: 'center', maxLines: 2, autoFit: true }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 190, y: 1500, w: 700, h: 110, font: 'Montserrat', weight: 700, size: 56, color: '#ffffff', align: 'center', autoWidth: true, bg: { color: '#111111', radius: 55, padX: 54, padY: 0 } }),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 80, y: 1625, w: 920, h: 56, font: 'Montserrat', size: 36, color: '#8A857C', align: 'center', decoration: 'line-through' }),
  ]);
}

function landscape(): DesignDoc {
  return doc(1200, 628, { color: '#ffffff' }, [
    makeShape({ name: 'Фон товару', x: 0, y: 0, w: 600, h: 628, fill: { color: '#F1F1F3' } }),
    makeImage({ name: 'Фото товару', x: 30, y: 30, w: 540, h: 568 }),
    makeText({ name: 'Бренд', text: '{{brand|upper}}', x: 640, y: 60, w: 500, h: 50, font: 'Montserrat', weight: 700, size: 28, letterSpacing: 4, color: '#8A8A8E' }),
    makeText({ name: 'Назва', text: '{{title}}', x: 640, y: 120, w: 500, h: 200, font: 'Montserrat', weight: 700, size: 46, vAlign: 'top', maxLines: 3, autoFit: true, lineHeight: 115 }),
    makeText({ name: 'Ціна', text: '{{current_price_fmt}}', x: 640, y: 390, w: 500, h: 90, font: 'Montserrat', weight: 800, size: 66, color: RED }),
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: 640, y: 480, w: 500, h: 50, font: 'Montserrat', size: 32, color: '#9E9E9E', decoration: 'line-through' }),
    makeShape({ name: 'Кут знижки', shape: 'triangle', corner: 'tr', x: 1000, y: 0, w: 200, h: 200, fill: { color: RED }, condition: IF_DISCOUNT }),
    makeText({ name: 'Знижка %', text: '-{{discount_percent}}%', x: 1030, y: 40, w: 200, h: 60, rotation: 45, font: 'Montserrat', weight: 800, size: 40, color: '#ffffff', align: 'center' }),
  ]);
}

let cache: BuiltinTemplate[] | null = null;
export function builtinTemplates(): BuiltinTemplate[] {
  if (cache) return cache;
  cache = [
    { id: 'b-corner', name: 'Знижка в куті + переваги', formatId: 'square', doc: cornerSquare() },
    { id: 'b-minimal', name: 'Мінімал з бейджем', formatId: 'square', doc: minimalSquare() },
    { id: 'b-sale', name: 'Яскравий розпродаж', formatId: 'square', doc: saleSquare() },
    { id: 'b-circle', name: 'Фото на весь кадр + ціна', formatId: 'square', doc: priceCircleSquare() },
    { id: 'b-banner', name: 'Ціновий банер', formatId: 'portrait', doc: bannerPortrait() },
    { id: 'b-dark', name: 'Преміум темний', formatId: 'portrait', doc: darkPortrait() },
    { id: 'b-story-sale', name: 'Сторіз — розпродаж', formatId: 'story', doc: saleStory() },
    { id: 'b-story-min', name: 'Сторіз — мінімал', formatId: 'story', doc: minimalStory() },
    { id: 'b-landscape', name: 'Горизонтальний банер', formatId: 'landscape', doc: landscape() },
  ];
  return cache;
}
