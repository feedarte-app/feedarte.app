import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas, GlobalFonts, loadImage, type Image } from '@napi-rs/canvas';
import { env } from '../env';
import { FONTS } from '../../shared/fonts';
import { drawDesign, resolveDesign, collectUrls, parseIconUrl, iconSvg, setCanvasFactory, type ResolvedDesign } from '../../shared/render';

setCanvasFactory((w, h) => createCanvas(w, h) as any);
import { ProductContext } from '../../shared/fields';
import type { DesignDoc, ProductData } from '../../shared/types';
import { safeFetch, readLimited } from '../net';
import { cacheDir, publicDir } from '../storage';

let fontsReady = false;
export function registerFonts() {
  if (fontsReady) return;
  for (const f of FONTS) {
    for (const file of [f.file, f.italicFile]) {
      if (!file) continue;
      const p = path.join(env.fontsDir, file);
      if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, f.family);
    }
  }
  fontsReady = true;
}

/** fonts uploaded into projects: registered lazily per process/thread, by storage key */
export interface FontRef {
  cssFamily: string;
  key: string;
}
const customRegistered = new Set<string>();
export function ensureFonts(list: FontRef[] | undefined) {
  if (!list?.length) return;
  for (const f of list) {
    if (customRegistered.has(f.key)) continue;
    const p = path.join(publicDir, f.key);
    try {
      if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, f.cssFamily);
    } catch {
      /* broken file: text falls back to Inter */
    }
    customRegistered.add(f.key);
  }
}

const require_ = createRequire(import.meta.url);
let iconDir: string | null = null;
function iconsPath() {
  if (!iconDir) iconDir = path.join(path.dirname(require_.resolve('lucide-static/package.json')), 'icons');
  return iconDir;
}
export function readIcon(name: string): string | null {
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  const p = path.join(iconsPath(), `${name}.svg`);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// ---- remote image cache (disk + small in-memory LRU of decoded images) ----
/** creatives are ≤ 2000 px, so shop photos (often 3–5 MB, 4000+ px) are stored at most 2400 px — ~8× less disk */
const CACHE_MAX_SIDE = 2400;
async function shrinkForCache(buf: Buffer): Promise<Buffer> {
  if (buf.length < 600 * 1024) return buf;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isWebp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) return buf;
  try {
    const img = await loadImage(buf);
    const k = Math.min(1, CACHE_MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * k));
    const h = Math.max(1, Math.round(img.height * k));
    const c = createCanvas(w, h);
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    // jpeg keeps photos as photos; png/webp may carry transparency → webp
    const out = isJpeg ? await c.encode('jpeg', 90) : await c.encode('webp', 92);
    return out.length < buf.length ? out : buf;
  } catch {
    return buf;
  }
}

/** drop cached photos nobody used for a while (the renderer refetches them on demand) */
export async function pruneImageCache(maxAgeDays = 10) {
  let removed = 0;
  let bytes = 0;
  const limit = Date.now() - maxAgeDays * 86400_000;
  for (const sub of ['img', 'img-s']) {
    const root = path.join(cacheDir, sub);
    let dirs: string[] = [];
    try {
      dirs = await fsp.readdir(root);
    } catch {
      continue;
    }
    for (const d of dirs) {
      const dir = path.join(root, d);
      let files: string[] = [];
      try {
        files = await fsp.readdir(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        const p = path.join(dir, f);
        try {
          const st = await fsp.stat(p);
          if (Math.max(st.mtimeMs, st.atimeMs) < limit) {
            await fsp.unlink(p);
            removed++;
            bytes += st.size;
          }
        } catch {
          /* raced */
        }
      }
    }
  }
  return { removed, bytes };
}
const mem = new Map<string, Promise<Image | null>>();
const MEM_MAX = 80;

function cachePath(url: string) {
  const h = crypto.createHash('sha1').update(url).digest('hex');
  return path.join(cacheDir, 'img', h.slice(0, 2), h);
}

export async function fetchImageBytes(url: string): Promise<Buffer> {
  // local uploaded assets / rendered files
  if (url.startsWith('/a/') || url.startsWith(`${env.publicUrl}/a/`)) {
    const rel = url.startsWith('/') ? url.slice(1) : url.slice(env.publicUrl.length + 1);
    const p = path.resolve(publicDir, rel);
    if (!p.startsWith(publicDir + path.sep)) throw new Error('bad asset path');
    return fsp.readFile(p);
  }
  const cp = cachePath(url);
  try {
    const st = await fsp.stat(cp);
    // product images rarely change under the same URL; refresh weekly
    if (Date.now() - st.mtimeMs < 7 * 24 * 3600 * 1000) {
      const cached = await fsp.readFile(cp);
      if (cached.length < 1.5 * 1024 * 1024) return cached;
      // cached before photos were stored downsized: shrink once, keep the original timestamp
      const small = await shrinkForCache(cached);
      if (small !== cached) {
        await fsp.writeFile(cp + '.tmp', small);
        await fsp.rename(cp + '.tmp', cp);
        await fsp.utimes(cp, st.atime, st.mtime).catch(() => {});
      }
      return small;
    }
  } catch {
    /* miss */
  }
  const res = await safeFetch(url, { timeoutMs: 25000, headers: { accept: 'image/*,*/*' } });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buf = await shrinkForCache(await readLimited(res, 20 * 1024 * 1024));
  await fsp.mkdir(path.dirname(cp), { recursive: true });
  await fsp.writeFile(cp + '.tmp', buf);
  await fsp.rename(cp + '.tmp', cp);
  return buf;
}

async function loadAny(url: string): Promise<Image | null> {
  const icon = parseIconUrl(url);
  if (icon) {
    const raw = readIcon(icon.name);
    if (!raw) return null;
    return loadImage(Buffer.from(iconSvg(raw, icon.color, icon.sw, 512)));
  }
  const buf = await fetchImageBytes(url);
  return loadImage(buf);
}

/**
 * Decoded images are big (w×h×4 bytes), so the in-memory cache is bounded by pixels, not by count:
 * ~320 MB per render thread at most.
 */
const MEM_BUDGET_PX = 80_000_000;
let memPx = 0;
const memSize = new Map<string, number>();
export function getImage(url: string): Promise<Image | null> {
  let p = mem.get(url);
  if (p) {
    mem.delete(url);
    mem.set(url, p);
    return p;
  }
  p = loadAny(url).catch(() => null);
  mem.set(url, p);
  p.then((img) => {
    if (!img || !mem.has(url)) return;
    const px = img.width * img.height;
    memSize.set(url, px);
    memPx += px;
    while ((memPx > MEM_BUDGET_PX || mem.size > MEM_MAX) && mem.size > 1) {
      const oldest = mem.keys().next().value!;
      mem.delete(oldest);
      memPx -= memSize.get(oldest) ?? 0;
      memSize.delete(oldest);
    }
  });
  return p;
}

export async function renderResolved(r: ResolvedDesign, format: 'jpg' | 'png', quality = 90): Promise<{ buf: Buffer; missing: string[] }> {
  registerFonts();
  const urls = collectUrls(r);
  const images = new Map<string, Image>();
  const missing: string[] = [];
  await Promise.all(
    urls.map(async (u) => {
      const img = await getImage(u);
      if (img) images.set(u, img);
      else missing.push(u);
    }),
  );
  const canvas = createCanvas(r.doc.width, r.doc.height);
  const g = canvas.getContext('2d');
  drawDesign(g, r, images);
  const buf = format === 'png' ? await canvas.encode('png') : await canvas.encode('jpeg', quality);
  return { buf, missing };
}

export async function renderProduct(doc: DesignDoc, data: ProductData, format: 'jpg' | 'png' = 'jpg', maps?: import('../../shared/types').LogoMaps, fonts?: FontRef[]) {
  ensureFonts(fonts);
  const ctx = new ProductContext(data, doc.format);
  return renderResolved(resolveDesign(doc, ctx, maps), format);
}

/** Render and store one creative. Returns false when the product photo could not be loaded. */
export type RenderResult = { ok: true } | { ok: false; reason: string; url?: string };

export async function renderToStorage(r: ResolvedDesign, ext: 'jpg' | 'png', quality: number, key: string): Promise<RenderResult> {
  const { buf, missing } = await renderResolved(r, ext, quality);
  const lost = r.layers.find(
    (l) => l.visible && l.layer.type === 'image' && l.layer.source.kind === 'field' && l.url && missing.includes(l.url),
  );
  if (lost) return { ok: false, reason: 'Не вдалося завантажити фото товару (сайт не віддав файл або це не зображення)', url: lost.url };
  const { put } = await import('../storage');
  await put(key, buf);
  return { ok: true };
}
