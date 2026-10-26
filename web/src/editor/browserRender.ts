import { FONTS } from '../../../src/shared/fonts';
import { drawDesign, resolveDesign, collectUrls, parseIconUrl, type ResolvedDesign, type DrawOptions } from '../../../src/shared/render';
import { ProductContext } from '../../../src/shared/fields';
import type { DesignDoc, LogoMaps, ProductData } from '../../../src/shared/types';
import { imgProxy } from '../api';

let fontsPromise: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    const faces: FontFace[] = [];
    for (const f of FONTS) {
      const range = f.weights[0] === f.weights[1] ? String(f.weights[0]) : `${f.weights[0]} ${f.weights[1]}`;
      faces.push(new FontFace(f.family, `url(/fonts/${f.file})`, { weight: range, style: 'normal' }));
      if (f.italicFile) faces.push(new FontFace(f.family, `url(/fonts/${f.italicFile})`, { weight: range, style: 'italic' }));
    }
    await Promise.all(
      faces.map((ff) =>
        ff
          .load()
          .then(() => document.fonts.add(ff))
          .catch(() => {}),
      ),
    );
  })();
  return fontsPromise;
}

const cache = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImg(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url);
  if (p) return p;
  const icon = parseIconUrl(url);
  const src = icon ? `/api/icons/${icon.name}.svg?color=${encodeURIComponent(icon.color)}&sw=${icon.sw}` : imgProxy(url);
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
  await loadFonts();
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
