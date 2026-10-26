import type { Condition, IconLayer, ImageLayer, Layer, ShapeLayer, TextLayer } from './types';

let counter = 0;
export function uid(prefix = 'l'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${counter.toString(36)}`;
}

const base = (name: string) => ({
  id: uid(),
  name,
  x: 0,
  y: 0,
  w: 200,
  h: 60,
  rotation: 0,
  opacity: 100,
  visible: true,
  locked: false,
  condition: null as Condition | null,
  shadow: null,
});

export function makeText(p: Partial<TextLayer> = {}): TextLayer {
  return {
    ...base('Text'),
    type: 'text',
    text: 'Текст',
    font: 'Inter',
    size: 40,
    weight: 400,
    italic: false,
    color: '#111111',
    align: 'left',
    vAlign: 'middle',
    lineHeight: 120,
    letterSpacing: 0,
    decoration: 'none',
    transform: 'none',
    maxLines: 0,
    autoFit: false,
    autoWidth: false,
    hideIfEmpty: true,
    bg: null,
    w: 400,
    h: 60,
    ...p,
  };
}

export function makeImage(p: Partial<ImageLayer> = {}): ImageLayer {
  return {
    ...base('Image'),
    type: 'image',
    source: { kind: 'field', field: 'image_link' },
    fit: 'contain',
    hAlign: 'center',
    vAlign: 'middle',
    radius: 0,
    stroke: null,
    w: 600,
    h: 600,
    ...p,
  };
}

export function makeShape(p: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    ...base('Shape'),
    type: 'shape',
    shape: 'rect',
    fill: { color: '#E53935' },
    stroke: null,
    radius: 0,
    w: 300,
    h: 300,
    ...p,
  };
}

export function makeIcon(p: Partial<IconLayer> = {}): IconLayer {
  return {
    ...base('Icon'),
    type: 'icon',
    icon: 'star',
    color: '#111111',
    strokeWidth: 2,
    w: 80,
    h: 80,
    ...p,
  };
}

export const IF_DISCOUNT: Condition = { action: 'show', mode: 'all', rules: [{ field: 'has_discount', op: 'exists' }] };
export const IF_NO_DISCOUNT: Condition = { action: 'show', mode: 'all', rules: [{ field: 'has_discount', op: 'not_exists' }] };

/**
 * Ready-made price block with built-in discount logic:
 *  - discount → old price (grey, crossed out) + new price (accent colour)
 *  - no discount → one regular price in the normal colour
 */
export function makePriceBlock(
  box: { x: number; y: number; w: number },
  variant: 'stack' | 'row',
  opts: { font?: string; size?: number; accent?: string; color?: string; oldColor?: string; align?: 'left' | 'center' | 'right' } = {},
): Layer[] {
  const font = opts.font ?? 'Inter';
  const size = opts.size ?? 64;
  const accent = opts.accent ?? '#E53935';
  const color = opts.color ?? '#111111';
  const oldColor = opts.oldColor ?? '#9E9E9E';
  const align = opts.align ?? 'center';
  const oldSize = Math.round(size * 0.56);
  const h = Math.round(size * 1.35);
  if (variant === 'stack') {
    const oh = Math.round(oldSize * 1.4);
    return [
      makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: box.x, y: box.y, w: box.w, h: oh, font, size: oldSize, weight: 400, color: oldColor, align, decoration: 'line-through', autoFit: true, maxLines: 1 }),
      makeText({ name: 'Ціна зі знижкою', text: '{{current_price_fmt}}', x: box.x, y: box.y + oh, w: box.w, h, font, size, weight: 800, color: accent, align, autoFit: true, maxLines: 1, condition: structuredClone(IF_DISCOUNT) }),
      // without a discount the regular price takes the middle of the whole block
      makeText({ name: 'Ціна (без знижки)', text: '{{current_price_fmt}}', x: box.x, y: box.y, w: box.w, h: oh + h, font, size, weight: 800, color, align, autoFit: true, maxLines: 1, condition: structuredClone(IF_NO_DISCOUNT) }),
    ];
  }
  const gap = Math.round(size * 0.35);
  const oldW = Math.round(box.w * 0.42);
  return [
    makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', x: box.x, y: box.y, w: oldW, h, font, size: oldSize, weight: 400, color: oldColor, align: 'right', vAlign: 'middle', decoration: 'line-through', autoFit: true, maxLines: 1 }),
    makeText({ name: 'Ціна зі знижкою', text: '{{current_price_fmt}}', x: box.x + oldW + gap, y: box.y, w: box.w - oldW - gap, h, font, size, weight: 800, color: accent, align: 'left', vAlign: 'middle', autoFit: true, maxLines: 1, condition: structuredClone(IF_DISCOUNT) }),
    makeText({ name: 'Ціна (без знижки)', text: '{{current_price_fmt}}', x: box.x, y: box.y, w: box.w, h, font, size, weight: 800, color, align, vAlign: 'middle', autoFit: true, maxLines: 1, condition: structuredClone(IF_NO_DISCOUNT) }),
  ];
}

/** "-30%" badge that exists only for discounted products */
export function makeDiscountBadge(box: { x: number; y: number; w: number; h: number }, color = '#E53935'): Layer[] {
  return [
    makeShape({ name: 'Плашка знижки', shape: 'ellipse', ...box, fill: { color }, condition: structuredClone(IF_DISCOUNT) }),
    makeText({ name: 'Знижка %', text: '-{{discount_percent}}%', ...box, size: Math.round(box.h * 0.3), weight: 800, color: '#ffffff', align: 'center', vAlign: 'middle', autoFit: true, maxLines: 1 }),
  ];
}
