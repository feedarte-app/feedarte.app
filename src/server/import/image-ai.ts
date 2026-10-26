// PNG/JPG mockup → Feedarte design, using Claude (vision) to find texts, the product photo and badges.
// Static parts of the picture are kept as the background; dynamic parts are erased from it and
// rebuilt as live layers bound to feed fields.
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import type { DesignDoc, Layer, TextLayer } from '../../shared/types';
import { DEFAULT_FORMAT } from '../../shared/types';
import { IF_DISCOUNT, makeImage, makeShape, makeText } from '../../shared/layers';
import { FONTS } from '../../shared/fonts';
import { ImportError, saveAsset } from './common';
import type { ImportResult } from './figma';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROLES = ['title', 'brand', 'description', 'current_price', 'old_price', 'discount', 'static'] as const;
type Role = (typeof ROLES)[number];

interface AiElement {
  kind: 'text' | 'product_photo' | 'logo' | 'shape';
  role?: Role;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  font_family?: string;
  font_size?: number;
  font_weight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  shape_type?: 'rect' | 'ellipse' | 'burst';
  fill_color?: string;
  corner_radius?: number;
}

const SCHEMA = {
  type: 'object',
  properties: {
    background_color: { type: 'string', description: 'dominant background color, hex' },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['text', 'product_photo', 'logo', 'shape'] },
          role: { type: 'string', enum: [...ROLES] },
          x: { type: 'number' },
          y: { type: 'number' },
          w: { type: 'number' },
          h: { type: 'number' },
          text: { type: 'string' },
          font_family: { type: 'string', enum: FONTS.map((f) => f.family) },
          font_size: { type: 'number', description: 'cap-height based font size in px of the given image' },
          font_weight: { type: 'number' },
          color: { type: 'string' },
          align: { type: 'string', enum: ['left', 'center', 'right'] },
          uppercase: { type: 'boolean' },
          italic: { type: 'boolean' },
          strikethrough: { type: 'boolean' },
          shape_type: { type: 'string', enum: ['rect', 'ellipse', 'burst'] },
          fill_color: { type: 'string' },
          corner_radius: { type: 'number' },
        },
        required: ['kind', 'x', 'y', 'w', 'h'],
      },
    },
  },
  required: ['elements'],
};

const PROMPT = (w: number, h: number) => `You are converting a static ad creative (product catalog ad) into editable layers.
The image is ${w}×${h} px. Return every element with a tight bounding box in pixels of THIS image (x,y = top-left).

Return:
- kind "text" for EVERY separate text block (merge lines of one paragraph into one element; separate price, old price, discount, title, brand, slogans). Give exact text, the closest font_family from the enum, font_size (px, so that the rendered text height matches), font_weight (100–900), color (hex), align, uppercase/italic/strikethrough.
- role for texts: "title" (product name), "brand" (brand/manufacturer name of the product), "description", "current_price" (the price the customer pays now), "old_price" (crossed-out/previous price), "discount" (like -30%), or "static" (anything that is the same for all products: slogans, delivery info, store name, CTA).
- kind "product_photo" for the main product image (the item being sold) — one element, its full visible area.
- kind "logo" for store/brand logos and decorative icons (they stay part of the background).
- kind "shape" ONLY for solid-color plates directly behind a discount text or old price (badges/stickers): set role "discount" or "old_price", shape_type, fill_color, corner_radius.
Do not invent elements. Be precise with coordinates.`;

async function callClaude(apiKey: string, model: string, png: Buffer, w: number, h: number): Promise<{ background_color?: string; elements: AiElement[] }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      tools: [{ name: 'design_layout', description: 'Structured layout of the ad creative', input_schema: SCHEMA }],
      tool_choice: { type: 'tool', name: 'design_layout' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } },
            { type: 'text', text: PROMPT(w, h) },
          ],
        },
      ],
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 401) throw new ImportError('Ключ Anthropic API недійсний — перевірте його в Адмін-панель → Налаштування.');
  if (!res.ok) throw new ImportError(`AI-розпізнавання не вдалося: ${data?.error?.message ?? res.status}`);
  const tool = (data.content ?? []).find((c: any) => c.type === 'tool_use');
  if (!tool?.input?.elements) throw new ImportError('AI не повернув структуру макета. Спробуйте ще раз.');
  return tool.input;
}

function ringColor(px: Uint8ClampedArray, W: number, H: number, x: number, y: number, w: number, h: number): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const take = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
    const i = (Math.round(cy) * W + Math.round(cx)) * 4;
    rs.push(px[i]);
    gs.push(px[i + 1]);
    bs.push(px[i + 2]);
  };
  const step = Math.max(1, Math.round((w + h) / 200));
  for (let i = x; i <= x + w; i += step) {
    take(i, y);
    take(i, y + h);
  }
  for (let j = y; j <= y + h; j += step) {
    take(x, j);
    take(x + w, j);
  }
  const med = (a: number[]) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 255);
  return [med(rs), med(gs), med(bs)];
}

const hex = (c: [number, number, number]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Onion-peel inpainting: fills masked pixels layer by layer from the boundary with the average of
 *  already-known 8-neighbours. Continues edges/gradients far better than a single fill colour. */
function inpaint(data: Uint8ClampedArray, W: number, H: number, mask: Uint8Array) {
  let front: number[] = [];
  const isBoundary = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H && !mask[ny * W + nx]) return true;
      }
    return false;
  };
  for (let i = 0; i < mask.length; i++) if (mask[i] && isBoundary(i)) front.push(i);
  const queued = new Uint8Array(mask.length);
  for (const i of front) queued[i] = 1;
  while (front.length) {
    const vals: number[] = [];
    for (const i of front) {
      const x = i % W;
      const y = (i - x) / W;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!(dx || dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (mask[j]) continue;
          r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
        }
      vals.push(n ? r / n : 255, n ? g / n : 255, n ? b / n : 255);
    }
    const next: number[] = [];
    front.forEach((i, k) => {
      data[i * 4] = vals[k * 3]; data[i * 4 + 1] = vals[k * 3 + 1]; data[i * 4 + 2] = vals[k * 3 + 2]; data[i * 4 + 3] = 255;
      mask[i] = 0;
    });
    for (const i of front) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (mask[j] && !queued[j]) { queued[j] = 1; next.push(j); }
        }
    }
    front = next;
  }
}

export async function importFromImage(opts: {
  file: Buffer;
  projectId: string;
  width: number;
  apiKey: string;
  model?: string;
  /** test hook */
  analyze?: (png: Buffer, w: number, h: number) => Promise<{ background_color?: string; elements: AiElement[] }>;
}): Promise<ImportResult> {
  if (!opts.apiKey && !opts.analyze) throw new ImportError('Розпізнавання картинок не підключено: адміністратор має додати ключ Anthropic API в Адмін-панель → Налаштування.');
  let img: Image;
  try {
    img = await loadImage(opts.file);
  } catch {
    throw new ImportError('Не вдалося прочитати зображення. Підтримуються PNG, JPG, WEBP.');
  }
  const W0 = img.width;
  const H0 = img.height;
  if (W0 < 200 || H0 < 200) throw new ImportError('Зображення замале (мінімум 200×200)');

  // send a downscaled copy (long side ≤ 1568 px — what vision models use internally)
  const k = Math.min(1, 1568 / Math.max(W0, H0));
  const sw = Math.round(W0 * k);
  const sh = Math.round(H0 * k);
  const small = createCanvas(sw, sh);
  small.getContext('2d').drawImage(img, 0, 0, sw, sh);
  const smallPng = await small.encode('png');
  const analyze = opts.analyze ?? ((png: Buffer, w: number, h: number) => callClaude(opts.apiKey, opts.model ?? 'claude-sonnet-5-5', png, w, h));
  const ai = await analyze(smallPng, sw, sh);

  // map coordinates back to the original image, clamp
  const els = ai.elements
    .map((e) => ({ ...e, x: Math.max(0, e.x / k), y: Math.max(0, e.y / k), w: Math.min(W0, e.w / k), h: Math.min(H0, e.h / k), font_size: e.font_size ? e.font_size / k : undefined }))
    .filter((e) => e.w > 2 && e.h > 2);

  // ---- erase dynamic parts from the background ----
  const cv = createCanvas(W0, H0);
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W0, H0).data;
  // tight margin: sample the colour right next to the element (wide margins bleed into neighbouring areas)
  const pad = (e: { w: number; h: number }) => Math.max(2, Math.min(6, Math.round(Math.min(e.w, e.h) * 0.04)));
  const erase = (e: AiElement) => {
    const p = pad(e);
    const x = Math.round(e.x - p);
    const y = Math.round(e.y - p);
    const w = Math.round(e.w + p * 2);
    const h = Math.round(e.h + p * 2);
    g.fillStyle = hex(ringColor(px, W0, H0, x, y, w, h));
    g.fillRect(x, y, w, h);
  };
  const texts = els.filter((e) => e.kind === 'text');
  const photo = els.filter((e) => e.kind === 'product_photo').sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const dynShapes = els.filter((e) => e.kind === 'shape' && (e.role === 'discount' || e.role === 'old_price'));
  // product photo sits on its own (usually flat) backdrop → fill with the colour right around it
  if (photo) erase(photo);
  // texts and badge plates → inpaint (handles gradients and plates crossing several backgrounds)
  const mask = new Uint8Array(W0 * H0);
  const markRect = (e: AiElement) => {
    const p = pad(e);
    const x0 = Math.max(0, Math.floor(e.x - p)), y0 = Math.max(0, Math.floor(e.y - p));
    const x1 = Math.min(W0 - 1, Math.ceil(e.x + e.w + p)), y1 = Math.min(H0 - 1, Math.ceil(e.y + e.h + p));
    for (let y = y0; y <= y1; y++) mask.fill(1, y * W0 + x0, y * W0 + x1 + 1);
  };
  const markEllipse = (e: AiElement) => {
    const p = pad(e);
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, rx = e.w / 2 + p, ry = e.h / 2 + p;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H0 - 1, Math.ceil(cy + ry)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W0 - 1, Math.ceil(cx + rx)); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) mask[y * W0 + x] = 1;
  };
  texts.forEach(markRect);
  for (const e of dynShapes) (e.shape_type === 'ellipse' || e.shape_type === 'burst' ? markEllipse : markRect)(e);
  const id = g.getImageData(0, 0, W0, H0);
  inpaint(id.data, W0, H0, mask);
  g.putImageData(id, 0, 0);
  const bgUrl = await saveAsset(opts.projectId, 'Фон (з імпорту)', await cv.encode('jpeg', 92), 'jpg');

  // ---- build the layered design ----
  const s = opts.width / W0;
  const doc: DesignDoc = {
    width: Math.round(W0 * s),
    height: Math.round(H0 * s),
    background: { color: ai.background_color ?? '#FFFFFF', image: { kind: 'url', url: bgUrl }, imageFit: 'cover' },
    layers: [],
    format: { ...DEFAULT_FORMAT },
  };
  const sc = (e: AiElement) => ({ x: Math.round(e.x * s), y: Math.round(e.y * s), w: Math.max(4, Math.round(e.w * s)), h: Math.max(4, Math.round(e.h * s)) });
  const notes: string[] = [];
  const stats = { texts: 0, shapes: 0, images: 0, bound: 0 };

  for (const e of dynShapes) {
    doc.layers.push(
      makeShape({
        name: e.role === 'discount' ? 'Бейдж знижки' : 'Плашка старої ціни',
        ...sc(e),
        shape: e.shape_type ?? 'rect',
        fill: { color: e.fill_color ?? '#E53935' },
        radius: Math.round((e.corner_radius ?? 0) * s),
        condition: structuredClone(IF_DISCOUNT),
      }),
    );
    stats.shapes++;
  }
  if (photo) {
    doc.layers.push(makeImage({ name: 'Фото товару', ...sc(photo), fit: 'contain', source: { kind: 'field', field: 'image_link' } }));
    stats.images++;
    stats.bound++;
  } else notes.push('Фото товару не знайдено — додайте його з вкладки «Товар».');

  const TEMPLATE: Partial<Record<Role, string>> = {
    title: '{{title}}',
    brand: '{{brand}}',
    description: '{{description|strip}}',
    current_price: '{{current_price_fmt}}',
    old_price: '{{old_price_fmt}}',
  };
  for (const e of texts) {
    const role: Role = (e.role as Role) ?? 'static';
    let text = e.text ?? '';
    if (role === 'discount') text = /\d/.test(text) ? text.replace(/\d{1,2}/, '{{discount_percent}}') : '-{{discount_percent}}%';
    else if (TEMPLATE[role]) text = TEMPLATE[role]!;
    const font = FONTS.find((f) => f.family === e.font_family) ?? FONTS[0];
    const b = sc(e);
    const size = Math.max(6, Math.round((e.font_size ?? e.h * 0.8) * s));
    const dynamic = role !== 'static';
    const lines = Math.max(1, Math.round(b.h / (size * 1.2)));
    const layer: TextLayer = makeText({
      name: { title: 'Назва', brand: 'Бренд', description: 'Опис', current_price: 'Ціна', old_price: 'Стара ціна', discount: 'Знижка %', static: (e.text ?? 'Текст').slice(0, 30) }[role],
      ...b,
      // some breathing room for dynamic values that are longer than the mockup text
      w: dynamic ? Math.round(b.w * 1.15) : b.w + 4,
      x: dynamic && e.align === 'right' ? b.x - Math.round(b.w * 0.15) : dynamic && e.align === 'center' ? b.x - Math.round(b.w * 0.075) : b.x,
      text,
      font: font.family,
      size,
      weight: Math.min(font.weights[1], Math.max(font.weights[0], Math.round((e.font_weight ?? 400) / 100) * 100)),
      italic: !!e.italic,
      color: e.color ?? '#111111',
      align: e.align ?? 'left',
      vAlign: 'middle',
      transform: e.uppercase ? 'uppercase' : 'none',
      decoration: e.strikethrough || role === 'old_price' ? 'line-through' : 'none',
      maxLines: dynamic ? Math.min(3, lines) : 0,
      autoFit: true,
    });
    doc.layers.push(layer);
    stats.texts++;
    if (dynamic) stats.bound++;
  }
  notes.push('Макет розпізнано AI: перевірте положення, шрифти й прив’язку текстів до полів. Логотипи й декор залишено у фоні.');
  return { doc, notes, stats };
}

export type { AiElement };
void (null as unknown as Layer);
