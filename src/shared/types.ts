// Shared design model — used by the browser editor and the server renderer.

export type ProductData = Record<string, string | string[]>;

export type ConditionOp =
  | 'exists'
  | 'not_exists'
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export interface ConditionRule {
  field: string;
  op: ConditionOp;
  value?: string;
}

export interface Condition {
  action: 'show' | 'hide';
  mode: 'all' | 'any';
  rules: ConditionRule[];
}

export interface Shadow {
  color: string;
  blur: number;
  x: number;
  y: number;
}

export interface Gradient {
  from: string;
  to: string;
  angle: number; // degrees
}

export interface Fill {
  color: string;
  gradient?: Gradient | null;
}

export interface LayerBase {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number; // 0..100
  visible: boolean;
  locked: boolean;
  condition?: Condition | null;
  shadow?: Shadow | null;
  groupId?: string | null;
}

export interface LayerGroup {
  id: string;
  name: string;
  condition?: Condition | null;
  locked?: boolean;
  visible?: boolean;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string; // template with {{field}} placeholders
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right' | 'justify';
  vAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number; // percent, 120 = 1.2
  letterSpacing: number; // px
  decoration: 'none' | 'underline' | 'overline' | 'line-through';
  transform: 'none' | 'capitalize' | 'uppercase' | 'lowercase';
  maxLines: number; // 0 = unlimited
  autoFit: boolean; // shrink font to fit the box
  autoWidth: boolean; // box width follows text width (badges)
  hideIfEmpty: boolean; // hide when all referenced fields are empty
  bg?: { color: string; radius: number; padX: number; padY: number } | null;
}

export type ImageSource =
  | { kind: 'field'; field: string; index?: number }
  | { kind: 'url'; url: string }
  /** dynamic logo: picks an image from the project's logo library by the value of a feed field (e.g. brand) */
  | { kind: 'map'; field: string };

/** project logo libraries: field → normalized value → image url */
export type LogoMaps = Record<string, Record<string, string>>;

export interface ImageFallback {
  mode: 'text' | 'image' | 'hide';
  url?: string; // for mode=image
  font?: string;
  weight?: number;
  color?: string;
  uppercase?: boolean;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  source: ImageSource;
  fit: 'contain' | 'cover' | 'fill';
  hAlign: 'left' | 'center' | 'right';
  vAlign: 'top' | 'middle' | 'bottom';
  radius: number;
  stroke?: { color: string; width: number } | null;
  /** what to show when the image (e.g. a brand logo) is missing */
  fallback?: ImageFallback | null;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'triangle' | 'burst';

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: ShapeKind;
  fill: Fill | null;
  stroke: { color: string; width: number } | null;
  radius: number; // rect corner radius
  corner?: 'tl' | 'tr' | 'bl' | 'br'; // right-angle corner for triangle
  points?: number; // burst spikes
}

export interface IconLayer extends LayerBase {
  type: 'icon';
  icon: string; // lucide icon name
  color: string;
  strokeWidth: number;
}

export type Layer = TextLayer | ImageLayer | ShapeLayer | IconLayer;
export type LayerType = Layer['type'];

export interface FormatSettings {
  currencyLabel: string; // e.g. "грн"
  currencyPosition: 'before' | 'after';
  thousandSep: string;
  decimalSep: string;
  decimals: number; // 0 = auto (no decimals when whole)
  discountMin: number; // min % for has_discount
}

export interface DesignDoc {
  width: number;
  height: number;
  background: Fill & { image?: ImageSource | null; imageFit?: 'contain' | 'cover' };
  layers: Layer[]; // index 0 = bottom
  groups?: LayerGroup[];
  format: FormatSettings;
}

export const DEFAULT_FORMAT: FormatSettings = {
  currencyLabel: 'грн',
  currencyPosition: 'after',
  thousandSep: ' ',
  decimalSep: ',',
  decimals: 0,
  discountMin: 1,
};

export interface FeedField {
  key: string;
  count: number;
  sample: string;
}

export const FORMATS = [
  { id: 'square', label: 'Квадрат 1:1', w: 1080, h: 1080, hint: 'Meta Feed, каталог, каруселі' },
  { id: 'portrait', label: 'Вертикальний 4:5', w: 1080, h: 1350, hint: 'Meta Feed (Instagram/Facebook)' },
  { id: 'story', label: 'Сторіз 9:16', w: 1080, h: 1920, hint: 'Stories, Reels, TikTok' },
  { id: 'landscape', label: 'Горизонтальний 1.91:1', w: 1200, h: 628, hint: 'Facebook, Audience Network' },
] as const;
export type FormatId = (typeof FORMATS)[number]['id'];
