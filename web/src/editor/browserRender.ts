import { FONTS } from '../../../src/shared/fonts';
import { drawDesign, resolveDesign, collectUrls, parseIconUrl, type ResolvedDesign, type DrawOptions } from '../../../src/shared/render';
import { ProductContext } from '../../../src/shared/fields';
import type { CustomFont, DesignDoc, LogoMaps, ProductData } from '../../../src/shared/types';
import { imgProxy } from '../api';

// ---- fonts: loaded lazily, only the families a design actually uses ----
let customFonts: CustomFont[] = [];
const familyLoads = new Map<string, Promise<void>>();

/** fonts uploaded into the current project */
export function setCustomFonts(list: CustomFont[]) {
  customFonts = list;
}
export function getCustomFonts() {
  return customFonts;
}

function facesFor(family: string): FontFace[] {
  const f = FONTS.find((x) => x.family === family);
  if (f) {
    const range = f.weights[0] === f.weights[1] ? String(f.weights[0]) : `${f.weights[0]} ${f.weights[1]}`;
    const out = [new FontFace(f.family, `url(/fonts/${f.file})`, { weight: range, style: 'normal' })];
    if (f.italicFile) out.push(new FontFace(f.family, `url(/fonts/${f.italicFile})`, { weight: range, style: 'italic' }));
    return out;
  }
  return customFonts
    .filter((c) => c.cssFamily === family)
    .map((c) => new FontFace(c.cssFamily, `url(${c.url})`, { weight: c.weightMax ? `${c.weight} ${c.weightMax}` : String(c.weight), style: c.italic ? 'italic' : 'normal' }));
}

export function ensureFamily(family: string): Promise<void> {
  const ver = family.startsWith('cf_') ? customFonts.filter((c) => c.cssFamily === family).map((c) => c.id).join(',') : '';
  const k = `${family}|${ver}`;
  let p = familyLoads.get(k);
  if (!p) {
    p = Promise.all(
      facesFor(family).map((ff) =>
        ff
          .load()
          .then(() => {
            document.fonts.add(ff);
          })
          .catch(() => {}),
      ),
    ).then(() => {});
    familyLoads.set(k, p);
  }
  return p;
}

export function docFamilies(doc: DesignDoc): string[] {
  const s = new Set<string>(['Inter']);
  for (const l of doc.layers) {
    if (l.type === 'text') s.add(l.font);
    if (l.type === 'image' && l.fallback?.mode === 'text') s.add(l.fallback.font ?? 'Montserrat');
  }
  return [...s];
}

export function ensureDocFonts(doc: DesignDoc): Promise<void> {
  return Promise.all(docFamilies(doc).map(ensureFamily)).then(() => {});
}

/** kept for callers that only need the default face */
export function loadFonts(): Promise<void> {
  return ensureFamily('Inter');
}

/** editor/previews never need more than this: designs are ~1080 px and the canvas is shown at ≤2× */
const PREVIEW_MAX = 1600;
const cache = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImg(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url);
  if (p) return p;
  const icon = parseIconUrl(url);
  const src = icon ? `/api/icons/${icon.name}.svg?color=${encodeURIComponent(icon.color)}&sw=${icon.sw}` : imgProxy(url, PREVIEW_MAX);
  p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(url, p);
  if (cache.size > 400) cache.delete(cache.keys().next().value!);
  return p;
}

export async function loadImages(r: ResolvedDesign, includeHidden = false): Promise<Map<string, HTMLImageElement>> {
  const urls = collectUrls(r, includeHidden);
  const m = new Map<string, HTMLImageElement>();
  await Promise.all(
    urls.map(async (u) => {
      const img = await loadImg(u);
      if (img) m.set(u, img);
    }),
  );
  return m;
}

export function resolveFor(doc: DesignDoc, product: ProductData | null, maps?: LogoMaps): ResolvedDesign {
  return resolveDesign(doc, new ProductContext(product ?? {}, doc.format), maps);
}

/** Render a design into a canvas element at a given CSS width (keeps aspect ratio). */
export async function renderPreview(canvas: HTMLCanvasElement, doc: DesignDoc, product: ProductData | null, cssWidth: number, opts: DrawOptions = {}, maps?: LogoMaps) {
  await ensureDocFonts(doc);
  const r = resolveFor(doc, product, maps);
  const images = await loadImages(r, !!opts.ghostHidden);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const scale = (cssWidth / doc.width) * dpr;
  canvas.width = Math.round(doc.width * scale);
  canvas.height = Math.round(doc.height * scale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * doc.height) / doc.width}px`;
  const g = canvas.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  drawDesign(g, r, images, opts);
}
