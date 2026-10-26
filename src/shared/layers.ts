import type { Condition, IconLayer, ImageLayer, ShapeLayer, TextLayer } from './types';

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
