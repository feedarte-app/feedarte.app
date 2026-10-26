// Figma → Feedarte design converter (Figma REST API, personal access token).
// Texts, rectangles/ellipses become editable layers; vectors/icons/rotated or complex nodes are
// exported as PNG assets. Prices, discounts, titles are auto-bound to feed variables.
import type { DesignDoc, Fill, ImageLayer, Layer, ShapeLayer, TextLayer } from '../../shared/types';
import { DEFAULT_FORMAT } from '../../shared/types';
import { IF_DISCOUNT, makeImage, makeShape, makeText, uid } from '../../shared/layers';
import { FONTS } from '../../shared/fonts';
import { safeFetch, readLimited } from '../net';
import { guessBinding, ImportError, matchFont, saveAsset, smartPriceBlock, toHex } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */
type FNode = any;

export function parseFigmaUrl(url: string): { key: string; nodeId: string | null } {
  const m = url.match(/figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/);
  if (!m) throw new ImportError('Це не схоже на посилання Figma (очікується figma.com/design/...)');
  let key = m[1];
  const branch = url.match(/\/branch\/([A-Za-z0-9]+)/);
  if (branch) key = branch[1];
  let nodeId: string | null = null;
  try {
    const nid = new URL(url).searchParams.get('node-id');
    if (nid) nodeId = decodeURIComponent(nid).replace(/-/g, ':');
  } catch {
    /* ignore */
  }
  return { key, nodeId };
}

async function figma(path: string, token: string): Promise<any> {
  const res = await safeFetch(`https://api.figma.com${path}`, { timeoutMs: 90000, headers: { 'X-Figma-Token': token } });
  const text = (await readLimited(res, 200 * 1024 * 1024)).toString('utf8');
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError(`Figma відповіла некоректно (${res.status})`);
  }
  if (res.status === 403) throw new ImportError('Figma: немає доступу. Перевірте токен в адмінці та що файл доступний цьому акаунту Figma.');
  if (res.status === 404) throw new ImportError('Figma: файл або фрейм не знайдено. Перевірте посилання.');
  if (!res.ok) throw new ImportError(`Figma: ${data.err ?? data.message ?? res.status}`);
  return data;
}

const FRAMEISH = new Set(['FRAME', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET', 'SECTION', 'GROUP']);
const VECTORISH = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'REGULAR_POLYGON', 'LINE']);

function visibleFills(n: FNode): any[] {
  return (n.fills ?? []).filter((f: any) => f.visible !== false && (f.opacity ?? 1) > 0.001);
}

function fillOf(n: FNode): Fill | null | 'complex' {
  const fills = visibleFills(n);
  if (!fills.length) return null;
  if (fills.length > 1) return 'complex';
  const f = fills[0];
  if (f.type === 'SOLID') return { color: toHex(f.color, f.opacity ?? 1) };
  if (f.type === 'GRADIENT_LINEAR' && f.gradientStops?.length >= 2 && f.gradientHandlePositions?.length >= 2) {
    const [p0, p1] = f.gradientHandlePositions;
    const bb = n.absoluteBoundingBox ?? { width: 1, height: 1 };
    const deg = (Math.atan2((p1.y - p0.y) * bb.height, (p1.x - p0.x) * bb.width) * 180) / Math.PI + 90;
    const stops = f.gradientStops;
    return {
      color: toHex(stops[0].color, f.opacity ?? 1),
      gradient: { from: toHex(stops[0].color, f.opacity ?? 1), to: toHex(stops[stops.length - 1].color, f.opacity ?? 1), angle: Math.round((deg + 360) % 360) },
    };
  }
  return 'complex';
}

function hasImageFill(n: FNode) {
  return visibleFills(n).some((f: any) => f.type === 'IMAGE');
}

function isRotated(n: FNode) {
  return Math.abs(n.rotation ?? 0) > 0.01;
}

function onlyVectors(n: FNode): boolean {
  if (n.type === 'TEXT') return false;
  if (hasImageFill(n)) return false;
  if (VECTORISH.has(n.type)) return true;
  if (n.type === 'RECTANGLE' || n.type === 'ELLIPSE') return true;
  if (n.children?.length) return n.children.filter((c: FNode) => c.visible !== false).every(onlyVectors);
  return true;
}

export interface ImportResult {
  doc: DesignDoc;
  notes: string[];
  stats: { texts: number; shapes: number; images: number; bound: number };
}

export async function importFromFigma(opts: {
  url: string;
  token: string;
  projectId: string;
  width: number;
  /** test hooks */
  api?: (path: string) => Promise<any>;
  download?: (url: string) => Promise<Buffer>;
}): Promise<ImportResult> {
  const api = opts.api ?? ((p: string) => figma(p, opts.token));
  const download = opts.download ?? (async (u: string) => readLimited(await safeFetch(u, { timeoutMs: 60000 }), 25 * 1024 * 1024));
  if (!opts.token && !opts.api) throw new ImportError('Figma не підключено: адміністратор має додати Figma token в Адмін-панель → Налаштування.');
  let { key, nodeId } = parseFigmaUrl(opts.url);
  const notes: string[] = [];

  if (!nodeId) {
    const file = await api(`/v1/files/${key}?depth=2`);
    for (const page of file.document?.children ?? []) {
      const fr = (page.children ?? []).find((c: FNode) => ['FRAME', 'COMPONENT', 'INSTANCE'].includes(c.type));
      if (fr) {
        nodeId = fr.id;
        notes.push(`Фрейм не вказано в посиланні — взято перший: «${fr.name}». Щоб імпортувати інший, виділіть фрейм у Figma і скопіюйте посилання на нього.`);
        break;
      }
    }
    if (!nodeId) throw new ImportError('У файлі не знайдено жодного фрейму');
  }
  const data = await api(`/v1/files/${key}/nodes?ids=${encodeURIComponent(nodeId)}`);
  const root: FNode = data.nodes?.[nodeId]?.document;
  if (!root) throw new ImportError('Фрейм не знайдено. Скопіюйте посилання саме на фрейм (ПКМ → Copy link to selection).');
  const rb = root.absoluteBoundingBox;
  if (!rb?.width) throw new ImportError('Фрейм без розмірів');

  const s = opts.width / rb.width;
  const W = Math.round(rb.width * s);
  const H = Math.round(rb.height * s);
  const doc: DesignDoc = { width: W, height: H, background: { color: '#FFFFFF' }, layers: [], format: { ...DEFAULT_FORMAT } };
  const stats = { texts: 0, shapes: 0, images: 0, bound: 0 };

  const rootFill = fillOf(root);
  if (rootFill && rootFill !== 'complex') Object.assign(doc.background, rootFill);
  else if (rootFill === 'complex' || hasImageFill(root)) notes.push('Складний фон фрейму (зображення / кілька заливок) спрощено — перевірте фон у редакторі.');

  const box = (n: FNode, render = false) => {
    const b = (render && n.absoluteRenderBounds) || n.absoluteBoundingBox;
    return { x: Math.round((b.x - rb.x) * s), y: Math.round((b.y - rb.y) * s), w: Math.max(1, Math.round(b.width * s)), h: Math.max(1, Math.round(b.height * s)) };
  };
  const shadowOf = (n: FNode) => {
    const e = (n.effects ?? []).find((x: any) => x.type === 'DROP_SHADOW' && x.visible !== false);
    return e ? { color: toHex(e.color), blur: Math.round((e.radius ?? 0) * s), x: Math.round((e.offset?.x ?? 0) * s), y: Math.round((e.offset?.y ?? 0) * s) } : null;
  };

  const rasters: { node: FNode; layer: ImageLayer }[] = [];
  const photoCandidates: { node: FNode; layer: ImageLayer; area: number }[] = [];
  const substituted = new Set<string>();
  let mixed = 0;

  const raster = (n: FNode, op: number) => {
    const b = box(n, true);
    const layer = makeImage({ id: uid(), name: n.name, ...b, fit: 'fill', source: { kind: 'url', url: '' }, opacity: Math.round(op * 100) });
    doc.layers.push(layer);
    rasters.push({ node: n, layer });
  };

  const walk = (n: FNode, parentOp: number) => {
    if (n.visible === false || n.isMask) {
      if (n.isMask) notes.push(`Маску «${n.name}» пропущено`);
      return;
    }
    if (!n.absoluteBoundingBox) return;
    const op = parentOp * (n.opacity ?? 1);
    if (op < 0.01) return;

    if (n.type === 'TEXT') {
      if (isRotated(n)) return raster(n, op);
      const st = n.style ?? {};
      const [font, sub] = matchFont(st.fontFamily);
      if (sub) substituted.add(`${st.fontFamily} → ${font}`);
      const fdef = FONTS.find((f) => f.family === font)!;
      const weight = Math.min(fdef.weights[1], Math.max(fdef.weights[0], st.fontWeight ?? 400));
      const fill = visibleFills(n).find((f: any) => f.type === 'SOLID');
      const strike = st.textDecoration === 'STRIKETHROUGH';
      const b = box(n);
      const { template, bound } = guessBinding(n.characters ?? '', n.name ?? '', strike);
      if (n.characterStyleOverrides?.length) mixed++;
      const size = Math.max(4, Math.round((st.fontSize ?? 16) * s));
      const lh = st.lineHeightPercentFontSize ? Math.round(st.lineHeightPercentFontSize) : st.lineHeightPx && st.fontSize ? Math.round((st.lineHeightPx / st.fontSize) * 100) : 120;
      const autoW = st.textAutoResize === 'WIDTH_AND_HEIGHT';
      const align: TextLayer['align'] = ({ LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' } as Record<string, TextLayer['align']>)[st.textAlignHorizontal] ?? 'left';
      const lines = Math.max(1, Math.round((b.h / ((size * lh) / 100)) || 1));
      const layer: TextLayer = makeText({
        id: uid(),
        name: n.name || 'Text',
        ...b,
        // give text a little room: font metrics differ slightly between Figma and our renderer
        w: autoW ? b.w + Math.round(size * 0.6) : b.w,
        x: autoW && align === 'right' ? b.x - Math.round(size * 0.6) : autoW && align === 'center' ? b.x - Math.round(size * 0.3) : b.x,
        text: template,
        font,
        size,
        weight,
        italic: !!st.italic,
        color: fill ? toHex(fill.color, fill.opacity ?? 1) : '#111111',
        align,
        vAlign: ({ TOP: 'top', CENTER: 'middle', BOTTOM: 'bottom' } as Record<string, TextLayer['vAlign']>)[st.textAlignVertical] ?? 'top',
        lineHeight: lh,
        letterSpacing: Math.round(((st.letterSpacing ?? 0) * s) * 10) / 10,
        decoration: strike ? 'line-through' : st.textDecoration === 'UNDERLINE' ? 'underline' : 'none',
        transform: ({ UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' } as Record<string, TextLayer['transform']>)[st.textCase] ?? 'none',
        maxLines: bound ? Math.min(3, lines) : 0,
        autoFit: true,
        opacity: Math.round(op * 100),
        shadow: shadowOf(n),
      });
      if (bound) stats.bound++;
      stats.texts++;
      doc.layers.push(layer);
      return;
    }

    if (isRotated(n)) return raster(n, op);

    if (hasImageFill(n) && !n.children?.length) {
      const tok = (n.name ?? '').match(/\{\{\s*([^}|]+?)\s*\}\}/);
      const f = visibleFills(n).find((x: any) => x.type === 'IMAGE');
      const b = box(n);
      const layer = makeImage({
        id: uid(),
        name: n.name || 'Image',
        ...b,
        fit: f?.scaleMode === 'FIT' ? 'contain' : 'cover',
        radius: Math.round((n.cornerRadius ?? 0) * s),
        source: { kind: 'url', url: '' },
        opacity: Math.round(op * 100),
        shadow: shadowOf(n),
      });
      doc.layers.push(layer);
      if (tok) {
        layer.source = { kind: 'field', field: tok[1] };
        stats.bound++;
      } else {
        photoCandidates.push({ node: n, layer, area: b.w * b.h });
        rasters.push({ node: n, layer });
      }
      stats.images++;
      return;
    }

    if (n.type === 'RECTANGLE' || n.type === 'ELLIPSE') {
      const fill = fillOf(n);
      if (fill === 'complex') return raster(n, op);
      const stroke = (n.strokes ?? []).find((x: any) => x.visible !== false && x.type === 'SOLID');
      const radii: number[] | undefined = n.rectangleCornerRadii;
      const layer: ShapeLayer = makeShape({
        id: uid(),
        name: n.name || 'Shape',
        ...box(n),
        shape: n.type === 'ELLIPSE' ? 'ellipse' : 'rect',
        fill,
        stroke: stroke && (n.strokeWeight ?? 0) > 0 ? { color: toHex(stroke.color, stroke.opacity ?? 1), width: Math.max(1, Math.round(n.strokeWeight * s)) } : null,
        radius: Math.round((n.cornerRadius ?? (radii ? radii.reduce((a, c) => a + c, 0) / radii.length : 0)) * s),
        opacity: Math.round(op * 100),
        shadow: shadowOf(n),
      });
      stats.shapes++;
      doc.layers.push(layer);
      return;
    }

    if (VECTORISH.has(n.type)) return raster(n, op);

    if (FRAMEISH.has(n.type) || n.children) {
      const b = box(n);
      // small vector-only groups (icons, logos) → one image
      if (n.children?.length && onlyVectors(n) && b.w * b.h < W * H * 0.25 && n.children.length > 1) return raster(n, op);
      const fill = fillOf(n);
      if (fill === 'complex' || hasImageFill(n)) {
        notes.push(`Фон контейнера «${n.name}» (зображення або кілька заливок) спрощено`);
      } else if (fill) {
        const stroke = (n.strokes ?? []).find((x: any) => x.visible !== false && x.type === 'SOLID');
        doc.layers.push(
          makeShape({
            id: uid(),
            name: n.name || 'Frame',
            ...b,
            fill,
            radius: Math.round((n.cornerRadius ?? 0) * s),
            stroke: stroke && (n.strokeWeight ?? 0) > 0 ? { color: toHex(stroke.color, stroke.opacity ?? 1), width: Math.max(1, Math.round(n.strokeWeight * s)) } : null,
            opacity: Math.round(op * 100),
            shadow: shadowOf(n),
          }),
        );
        stats.shapes++;
      }
      for (const c of n.children ?? []) walk(c, op);
      return;
    }
    raster(n, op);
  };

  for (const c of root.children ?? []) walk(c, 1);

  // designers often draw the price strike-through as a separate line → turn it into real text decoration
  // (a separate line does not follow the price length and would stay visible without a discount)
  const thinOver = (l: Layer, t: TextLayer) => {
    if (l.h > Math.max(8, t.h * 0.3)) return false;
    const cy = l.y + l.h / 2;
    if (cy < t.y || cy > t.y + t.h) return false;
    const ov = Math.min(l.x + l.w, t.x + t.w) - Math.max(l.x, t.x);
    return ov > Math.min(l.w, t.w) * 0.5;
  };
  let strikes = 0;
  for (const t of doc.layers.filter((l): l is TextLayer => l.type === 'text')) {
    const priceLike = /price_fmt/.test(t.text);
    if (!priceLike) continue;
    const lines = doc.layers.filter((l) => l !== t && (l.type === 'shape' || l.type === 'image') && thinOver(l, t));
    if (!lines.length) continue;
    t.decoration = 'line-through';
    if (t.text.includes('current_price_fmt')) t.text = '{{old_price_fmt}}';
    for (const ln of lines) {
      doc.layers.splice(doc.layers.indexOf(ln), 1);
      const ri = rasters.findIndex((r) => r.layer === ln);
      if (ri >= 0) rasters.splice(ri, 1);
      strikes++;
    }
  }
  if (strikes) notes.push(`Окрему лінію закреслення над ціною замінено на закреслення тексту — тепер вона підлаштовується під довжину ціни й зникає без знижки.`);

  // the biggest photo (not the whole background) is most likely the product photo
  const frameArea = W * H;
  const photo = photoCandidates.filter((p) => p.area > frameArea * 0.08 && p.area < frameArea * 0.97).sort((a, b) => b.area - a.area)[0];
  if (photo) {
    photo.layer.source = { kind: 'field', field: 'image_link' };
    photo.layer.fit = 'contain';
    photo.layer.name = 'Фото товару';
    rasters.splice(rasters.findIndex((r) => r.layer === photo.layer), 1);
    stats.bound++;
    notes.push(`Зображення «${photo.node.name}» прив'язано до фото товару (image_link). Якщо це не так — змініть джерело у властивостях шару.`);
  } else if (!doc.layers.some((l) => l.type === 'image' && l.source.kind === 'field')) {
    notes.push('Фото товару не визначено автоматично. Додайте його з вкладки «Товар» або назвіть шар у Figma {{image_link}}.');
  }

  // export everything that has to be rasterized (batched)
  if (rasters.length) {
    const scale = Math.min(4, Math.max(1, Math.round(s * 2 * 100) / 100));
    const ids = [...new Set(rasters.map((r) => r.node.id))];
    const urls: Record<string, string | null> = {};
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      const r = await api(`/v1/images/${key}?ids=${encodeURIComponent(chunk.join(','))}&format=png&scale=${scale}`);
      Object.assign(urls, r.images ?? {});
    }
    await Promise.all(
      rasters.map(async ({ node, layer }) => {
        const u = urls[node.id];
        if (!u) return;
        try {
          const buf = await download(u);
          layer.source = { kind: 'url', url: await saveAsset(opts.projectId, node.name, buf, 'png') };
        } catch {
          /* handled below */
        }
      }),
    );
    const lost = rasters.filter((r) => r.layer.source.kind === 'url' && !r.layer.source.url);
    if (lost.length) {
      notes.push(`${lost.length} елемент(и) не вдалося експортувати з Figma — їх пропущено.`);
      doc.layers = doc.layers.filter((l) => !lost.some((x) => x.layer === l));
    }
    stats.images += rasters.length - lost.length;
  }

  // plates under a discount text (badge backgrounds) → show only when there is a discount
  const discountTexts = doc.layers.filter((l): l is TextLayer => l.type === 'text' && l.text.includes('discount_percent'));
  for (const t of discountTexts) {
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    const ti = doc.layers.indexOf(t);
    doc.layers.forEach((l, i) => {
      if (i >= ti || l.type === 'text' || l.condition) return;
      if (cx >= l.x && cx <= l.x + l.w && cy >= l.y && cy <= l.y + l.h && l.w * l.h < frameArea * 0.2) l.condition = structuredClone(IF_DISCOUNT);
    });
  }

  if (smartPriceBlock(doc)) notes.push('Стару й нову ціну зібрано в «Блок ціни»: зі знижкою — нова ціна кольором і закреслена стара, без знижки — звичайна ціна нейтральним кольором.');
  if (substituted.size) notes.push(`Шрифти замінено на найближчі з бібліотеки: ${[...substituted].join(', ')}.`);
  if (mixed) notes.push(`${mixed} текст(и) мали кілька стилів у межах одного блоку — застосовано основний стиль.`);
  return { doc, notes, stats };
}

/** Sanity helper for tests: run the converter on an already-fetched node JSON (no network for nodes). */
export const _internal = { parseFigmaUrl, fillOf, guessBinding };
void (null as unknown as Layer);
