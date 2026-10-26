// Canvas renderer shared by browser (HTMLCanvasElement) and server (@napi-rs/canvas).
import type { DesignDoc, Fill, ImageLayer, ImageSource, Layer, LogoMaps, ShapeLayer, TextLayer, IconLayer } from './types';
import { DEFAULT_FORMAT } from './types';
import { ProductContext, evalCondition, normKey, renderTemplate, templateFields } from './fields';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type G = any; // CanvasRenderingContext2D-compatible
export type Img = any; // drawable image with width/height

export interface ResolvedLayer {
  layer: Layer;
  visible: boolean; // after condition + hideIfEmpty
  condHidden: boolean; // hidden because of condition / empty data
  text?: string;
  url?: string; // image url or icon pseudo-url
}

export interface ResolvedDesign {
  doc: DesignDoc;
  bgUrl?: string;
  layers: ResolvedLayer[];
}

export function iconUrl(l: IconLayer): string {
  return `icon://${l.icon}?color=${encodeURIComponent(l.color)}&sw=${l.strokeWidth}`;
}

export function parseIconUrl(u: string): { name: string; color: string; sw: number } | null {
  if (!u.startsWith('icon://')) return null;
  const [name, qs] = u.slice(7).split('?');
  const p = new URLSearchParams(qs ?? '');
  return { name, color: p.get('color') ?? '#000', sw: Number(p.get('sw') ?? 2) };
}

export function iconSvg(raw: string, color: string, sw: number, size = 256): string {
  return raw
    .replace(/currentColor/g, color)
    .replace(/stroke-width="[^"]*"/, `stroke-width="${sw}"`)
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`);
}

function resolveImage(src: ImageSource | null | undefined, ctx: ProductContext, maps?: LogoMaps): string | undefined {
  if (!src) return undefined;
  if (src.kind === 'url') return src.url || undefined;
  if (src.kind === 'map') {
    const v = ctx.get(src.field);
    return v ? maps?.[src.field]?.[normKey(v)] || undefined : undefined;
  }
  const list = ctx.images(src.field);
  return list[src.index ?? 0] || undefined;
}

export function resolveDesign(doc: DesignDoc, ctx: ProductContext, maps?: LogoMaps): ResolvedDesign {
  const groups = new Map<string, { visible: boolean; condOk: boolean }>();
  for (const g of doc.groups ?? []) groups.set(g.id, { visible: g.visible !== false, condOk: evalCondition(g.condition, ctx) });
  const layers: ResolvedLayer[] = doc.layers.map((layer) => {
    const grp = layer.groupId ? groups.get(layer.groupId) : undefined;
    let condOk = evalCondition(layer.condition, ctx) && (grp ? grp.condOk : true);
    const r: ResolvedLayer = { layer, visible: false, condHidden: false };
    if (layer.type === 'text') {
      r.text = applyTransform(renderTemplate(layer.text, ctx), layer.transform);
      if (layer.hideIfEmpty) {
        const fields = templateFields(layer.text);
        if (fields.length && fields.every((f) => !ctx.get(f.split('|')[0]))) condOk = false;
      }
      if (!r.text.trim()) condOk = false;
    } else if (layer.type === 'image') {
      r.url = resolveImage(layer.source, ctx, maps);
      if (!r.url && layer.fallback && layer.fallback.mode !== 'hide') {
        if (layer.fallback.mode === 'image') r.url = layer.fallback.url || undefined;
        else if (layer.source.kind !== 'url') {
          const v = ctx.get(layer.source.field).trim();
          if (v) r.text = layer.fallback.uppercase ? v.toLocaleUpperCase('uk-UA') : v;
        }
      }
      if (!r.url && !r.text) condOk = false;
    } else if (layer.type === 'icon') {
      r.url = iconUrl(layer);
    }
    r.condHidden = !condOk;
    r.visible = layer.visible && (grp ? grp.visible : true) && condOk;
    return r;
  });
  return { doc, bgUrl: resolveImage(doc.background.image, ctx, maps), layers };
}

/** Stable fingerprint of everything that affects the output pixels for a product. */
export function resolvedFingerprint(r: ResolvedDesign): string {
  return JSON.stringify([r.bgUrl ?? '', r.layers.map((l) => (l.visible ? [l.text ?? '', l.url ?? ''] : 0))]);
}

export function collectUrls(r: ResolvedDesign, includeHidden = false): string[] {
  const s = new Set<string>();
  if (r.bgUrl) s.add(r.bgUrl);
  for (const l of r.layers) if (l.url && (l.visible || (includeHidden && l.layer.visible))) s.add(l.url);
  return [...s];
}

function applyTransform(s: string, t: TextLayer['transform']): string {
  switch (t) {
    case 'uppercase':
      return s.toLocaleUpperCase('uk-UA');
    case 'lowercase':
      return s.toLocaleLowerCase('uk-UA');
    case 'capitalize':
      return s.replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toLocaleUpperCase('uk-UA'));
    default:
      return s;
  }
}

// ---------- drawing helpers ----------

function setFill(g: G, fill: Fill | null | undefined, x: number, y: number, w: number, h: number): boolean {
  if (!fill) return false;
  if (fill.gradient) {
    const a = ((fill.gradient.angle ?? 90) - 90) * (Math.PI / 180);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const len = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
    const gr = g.createLinearGradient(cx - Math.cos(a) * len, cy - Math.sin(a) * len, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    gr.addColorStop(0, fill.gradient.from);
    gr.addColorStop(1, fill.gradient.to);
    g.fillStyle = gr;
    return true;
  }
  if (!fill.color || fill.color === 'transparent') return false;
  g.fillStyle = fill.color;
  return true;
}

function roundRectPath(g: G, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.arcTo(x + w, y, x + w, y + rr, rr);
  g.lineTo(x + w, y + h - rr);
  g.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  g.lineTo(x + rr, y + h);
  g.arcTo(x, y + h, x, y + h - rr, rr);
  g.lineTo(x, y + rr);
  g.arcTo(x, y, x + rr, y, rr);
  g.closePath();
}

function fontString(l: Pick<TextLayer, 'italic' | 'weight' | 'font'>, size: number) {
  return `${l.italic ? 'italic ' : ''}${l.weight} ${size}px "${l.font}", "Inter", sans-serif`;
}

function measure(g: G, s: string, ls: number): number {
  const w = g.measureText(s).width;
  return ls ? w + ls * Math.max(0, [...s].length - 1) : w;
}

export interface TextLayout {
  size: number;
  lines: string[];
  widths: number[];
  lineH: number;
  asc: number;
  desc: number;
  boxW: number; // effective width (autoWidth)
}

function wrapLines(g: G, text: string, maxW: number, ls: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const word of words) {
      const cand = line + word;
      if (!line || measure(g, cand.trimEnd(), ls) <= maxW) {
        if (!line && measure(g, word, ls) > maxW && word.trim()) {
          // break very long word by characters
          let chunk = '';
          for (const ch of word) {
            if (chunk && measure(g, chunk + ch, ls) > maxW) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else line = cand;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function layoutText(g: G, l: TextLayer, text: string): TextLayout {
  const padX = l.bg ? l.bg.padX : 0;
  const padY = l.bg ? l.bg.padY : 0;
  const ls = l.letterSpacing || 0;
  let size = l.size;
  const minSize = Math.max(6, Math.round(l.size * 0.3));
  for (;;) {
    g.font = fontString(l, size);
    const lineH = (size * (l.lineHeight || 120)) / 100;
    const m = g.measureText('HgЙ');
    const asc = m.fontBoundingBoxAscent ?? size * 0.8;
    const desc = m.fontBoundingBoxDescent ?? size * 0.2;
    let lines: string[];
    let boxW: number;
    if (l.autoWidth) {
      lines = text.split('\n');
      boxW = Math.max(...lines.map((s) => measure(g, s, ls))) + padX * 2;
    } else {
      boxW = l.w;
      lines = wrapLines(g, text, Math.max(1, l.w - padX * 2), ls);
    }
    let truncated = false;
    if (l.maxLines > 0 && lines.length > l.maxLines) {
      truncated = true;
    }
    const fitsH = lines.length * lineH <= l.h - padY * 2 + 0.5;
    const fitsW = l.autoWidth ? true : lines.every((s) => measure(g, s, ls) <= l.w - padX * 2 + 0.5);
    if (l.autoFit && (!fitsH || !fitsW || truncated) && size > minSize) {
      size = Math.max(minSize, Math.floor(size * 0.94));
      continue;
    }
    if (truncated) {
      lines = lines.slice(0, l.maxLines);
      const maxW = l.w - padX * 2;
      let last = lines[lines.length - 1];
      while (last && measure(g, last + '…', ls) > maxW) last = last.slice(0, -1);
      lines[lines.length - 1] = last.trimEnd() + '…';
    }
    const widths = lines.map((s) => measure(g, s, ls));
    return { size, lines, widths, lineH, asc, desc, boxW };
  }
}

/** Box actually occupied by the layer (autoWidth text changes it). */
export function effectiveBox(g: G, r: ResolvedLayer): { x: number; y: number; w: number; h: number } {
  const l = r.layer;
  if (l.type === 'text' && l.autoWidth && r.text) {
    const lay = layoutText(g, l, r.text);
    const w = lay.boxW;
    const x = l.align === 'right' ? l.x + l.w - w : l.align === 'center' ? l.x + (l.w - w) / 2 : l.x;
    return { x, y: l.y, w, h: l.h };
  }
  return { x: l.x, y: l.y, w: l.w, h: l.h };
}

function drawSpaced(g: G, s: string, x: number, y: number, ls: number) {
  if (!ls) {
    g.fillText(s, x, y);
    return;
  }
  let cx = x;
  for (const ch of s) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + ls;
  }
}

function drawText(g: G, l: TextLayer, text: string) {
  const lay = layoutText(g, l, text);
  const box = l.autoWidth
    ? { x: l.align === 'right' ? l.x + l.w - lay.boxW : l.align === 'center' ? l.x + (l.w - lay.boxW) / 2 : l.x, w: lay.boxW }
    : { x: l.x, w: l.w };
  const padX = l.bg ? l.bg.padX : 0;
  const padY = l.bg ? l.bg.padY : 0;
  if (l.bg && l.bg.color && l.bg.color !== 'transparent') {
    g.fillStyle = l.bg.color;
    roundRectPath(g, box.x, l.y, box.w, l.h, l.bg.radius);
    g.fill();
    g.shadowColor = 'transparent';
  }
  g.font = fontString(l, lay.size);
  g.fillStyle = l.color;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const total = lay.lines.length * lay.lineH;
  const innerH = l.h - padY * 2;
  const top = l.y + padY + (l.vAlign === 'middle' ? (innerH - total) / 2 : l.vAlign === 'bottom' ? innerH - total : 0);
  const innerX = box.x + padX;
  const innerW = box.w - padX * 2;
  const ls = l.letterSpacing || 0;
  lay.lines.forEach((line, i) => {
    const w = lay.widths[i];
    const baseline = top + i * lay.lineH + (lay.lineH - (lay.asc + lay.desc)) / 2 + lay.asc;
    let x = innerX;
    if (l.align === 'center') x = innerX + (innerW - w) / 2;
    else if (l.align === 'right') x = innerX + innerW - w;
    if (l.align === 'justify' && i < lay.lines.length - 1 && line.includes(' ')) {
      const words = line.split(' ');
      const wordsW = words.reduce((a, s) => a + measure(g, s, ls), 0);
      const gap = (innerW - wordsW) / (words.length - 1);
      let cx = innerX;
      for (const wd of words) {
        drawSpaced(g, wd, cx, baseline, ls);
        cx += measure(g, wd, ls) + gap;
      }
    } else {
      drawSpaced(g, line, x, baseline, ls);
    }
    if (l.decoration !== 'none') {
      const th = Math.max(1, lay.size / 14);
      let ly = baseline + th * 1.5;
      if (l.decoration === 'line-through') ly = baseline - lay.asc * 0.32;
      if (l.decoration === 'overline') ly = baseline - lay.asc;
      g.fillRect(l.align === 'justify' ? innerX : x, ly - th / 2, l.align === 'justify' && i < lay.lines.length - 1 ? innerW : w, th);
    }
  });
}

/** Brand name drawn in place of a missing logo. */
function fallbackTextLayer(l: ImageLayer): TextLayer {
  const fb = l.fallback ?? { mode: 'text' };
  return {
    ...l,
    type: 'text',
    text: '',
    font: fb.font ?? 'Montserrat',
    size: Math.max(8, Math.round(l.h * 0.55)),
    weight: fb.weight ?? 800,
    italic: false,
    color: fb.color ?? '#111111',
    align: l.hAlign === 'left' ? 'left' : l.hAlign === 'right' ? 'right' : 'center',
    vAlign: l.vAlign,
    lineHeight: 105,
    letterSpacing: 0,
    decoration: 'none',
    transform: 'none',
    maxLines: 2,
    autoFit: true,
    autoWidth: false,
    hideIfEmpty: false,
    bg: null,
  } as TextLayer;
}

function drawImageFit(g: G, img: Img, l: Pick<ImageLayer, 'x' | 'y' | 'w' | 'h' | 'fit' | 'hAlign' | 'vAlign'>) {
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  if (!iw || !ih) return;
  if (l.fit === 'fill') {
    g.drawImage(img, l.x, l.y, l.w, l.h);
    return;
  }
  const scale = l.fit === 'cover' ? Math.max(l.w / iw, l.h / ih) : Math.min(l.w / iw, l.h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = l.x + (l.hAlign === 'left' ? 0 : l.hAlign === 'right' ? l.w - dw : (l.w - dw) / 2);
  const dy = l.y + (l.vAlign === 'top' ? 0 : l.vAlign === 'bottom' ? l.h - dh : (l.h - dh) / 2);
  if (l.fit === 'cover') {
    g.save();
    g.beginPath();
    g.rect(l.x, l.y, l.w, l.h);
    g.clip();
    g.drawImage(img, dx, dy, dw, dh);
    g.restore();
  } else g.drawImage(img, dx, dy, dw, dh);
}

function drawImageLayer(g: G, l: ImageLayer, img: Img | undefined) {
  if (!img) return;
  if (l.radius > 0) {
    g.save();
    roundRectPath(g, l.x, l.y, l.w, l.h, l.radius);
    g.clip();
    drawImageFit(g, img, l);
    g.restore();
  } else drawImageFit(g, img, l);
  if (l.stroke && l.stroke.width > 0) {
    g.shadowColor = 'transparent';
    g.strokeStyle = l.stroke.color;
    g.lineWidth = l.stroke.width;
    roundRectPath(g, l.x, l.y, l.w, l.h, l.radius);
    g.stroke();
  }
}

function shapePath(g: G, l: ShapeLayer) {
  const { x, y, w, h } = l;
  g.beginPath();
  switch (l.shape) {
    case 'ellipse':
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle': {
      const c = l.corner ?? 'tl';
      const pts =
        c === 'tl'
          ? [[x, y], [x + w, y], [x, y + h]]
          : c === 'tr'
            ? [[x, y], [x + w, y], [x + w, y + h]]
            : c === 'bl'
              ? [[x, y], [x + w, y + h], [x, y + h]]
              : [[x + w, y], [x + w, y + h], [x, y + h]];
      g.moveTo(pts[0][0], pts[0][1]);
      g.lineTo(pts[1][0], pts[1][1]);
      g.lineTo(pts[2][0], pts[2][1]);
      g.closePath();
      break;
    }
    case 'burst': {
      const n = Math.max(5, l.points ?? 16);
      const cx = x + w / 2;
      const cy = y + h / 2;
      for (let i = 0; i < n * 2; i++) {
        const a = (Math.PI * i) / n - Math.PI / 2;
        const k = i % 2 === 0 ? 1 : 0.82;
        const px = cx + Math.cos(a) * (w / 2) * k;
        const py = cy + Math.sin(a) * (h / 2) * k;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
    }
    case 'line':
      g.moveTo(x, y + h / 2);
      g.lineTo(x + w, y + h / 2);
      break;
    default:
      roundRectPath(g, x, y, w, h, l.radius || 0);
  }
}

function drawShape(g: G, l: ShapeLayer) {
  if (l.shape === 'line') {
    shapePath(g, l);
    g.strokeStyle = l.stroke?.color ?? l.fill?.color ?? '#000';
    g.lineWidth = l.stroke?.width ?? Math.max(1, l.h);
    g.lineCap = 'butt';
    g.stroke();
    return;
  }
  shapePath(g, l);
  if (setFill(g, l.fill, l.x, l.y, l.w, l.h)) g.fill();
  if (l.stroke && l.stroke.width > 0) {
    g.shadowColor = 'transparent';
    g.strokeStyle = l.stroke.color;
    g.lineWidth = l.stroke.width;
    g.stroke();
  }
}

export interface DrawOptions {
  /** editor: draw condition-hidden layers semi-transparent */
  ghostHidden?: boolean;
  /** editor: skip a layer while it is being edited inline */
  skipId?: string;
}

export function drawDesign(g: G, r: ResolvedDesign, images: Map<string, Img>, opts: DrawOptions = {}) {
  const { doc } = r;
  g.save();
  g.clearRect(0, 0, doc.width, doc.height);
  if (setFill(g, doc.background, 0, 0, doc.width, doc.height)) g.fillRect(0, 0, doc.width, doc.height);
  else {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, doc.width, doc.height);
  }
  if (r.bgUrl && images.get(r.bgUrl)) {
    drawImageFit(g, images.get(r.bgUrl), {
      x: 0,
      y: 0,
      w: doc.width,
      h: doc.height,
      fit: doc.background.imageFit ?? 'cover',
      hAlign: 'center',
      vAlign: 'middle',
    });
  }
  for (const rl of r.layers) {
    const l = rl.layer;
    if (!l.visible || l.id === opts.skipId) continue;
    let alpha = (l.opacity ?? 100) / 100;
    if (rl.condHidden) {
      if (!opts.ghostHidden) continue;
      alpha *= 0.25;
      if (l.type === 'text' && !rl.text?.trim()) continue;
    }
    g.save();
    g.globalAlpha = alpha;
    if (l.rotation) {
      const cx = l.x + l.w / 2;
      const cy = l.y + l.h / 2;
      g.translate(cx, cy);
      g.rotate((l.rotation * Math.PI) / 180);
      g.translate(-cx, -cy);
    }
    if (l.shadow && (l.shadow.blur || l.shadow.x || l.shadow.y)) {
      g.shadowColor = l.shadow.color;
      g.shadowBlur = l.shadow.blur;
      g.shadowOffsetX = l.shadow.x;
      g.shadowOffsetY = l.shadow.y;
    }
    switch (l.type) {
      case 'text':
        if (rl.text) drawText(g, l, rl.text);
        break;
      case 'image':
        if (rl.url) drawImageLayer(g, l, images.get(rl.url));
        else if (rl.text) drawText(g, fallbackTextLayer(l), rl.text);
        break;
      case 'shape':
        drawShape(g, l);
        break;
      case 'icon': {
        const img = rl.url ? images.get(rl.url) : undefined;
        if (img) {
          const s = Math.min(l.w, l.h);
          g.drawImage(img, l.x + (l.w - s) / 2, l.y + (l.h - s) / 2, s, s);
        }
        break;
      }
    }
    g.restore();
  }
  g.restore();
}

export function newDoc(w: number, h: number): DesignDoc {
  return { width: w, height: h, background: { color: '#ffffff' }, layers: [], format: { ...DEFAULT_FORMAT } };
}
