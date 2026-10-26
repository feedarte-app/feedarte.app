import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas, GlobalFonts, loadImage, type Image } from '@napi-rs/canvas';
import { env } from '../env';
import { FONTS } from '../../shared/fonts';
import { drawDesign, resolveDesign, collectUrls, parseIconUrl, iconSvg, type ResolvedDesign } from '../../shared/render';
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
    if (!p.startsWith(publicDir)) throw new Error('bad asset path');
    return fsp.readFile(p);
  }
  const cp = cachePath(url);
  try {
    const st = await fsp.stat(cp);
    // product images rarely change under the same URL; refresh weekly
    if (Date.now() - st.mtimeMs < 7 * 24 * 3600 * 1000) return await fsp.readFile(cp);
  } catch {
    /* miss */
  }
  const res = await safeFetch(url, { timeoutMs: 25000, headers: { accept: 'image/*,*/*' } });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buf = await readLimited(res, 20 * 1024 * 1024);
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

export function getImage(url: string): Promise<Image | null> {
  let p = mem.get(url);
  if (p) {
    mem.delete(url);
    mem.set(url, p);
    return p;
  }
  p = loadAny(url).catch(() => null);
  mem.set(url, p);
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value!);
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

export async function renderProduct(doc: DesignDoc, data: ProductData, format: 'jpg' | 'png' = 'jpg') {
  const ctx = new ProductContext(data, doc.format);
  return renderResolved(resolveDesign(doc, ctx), format);
}

/** Render and store one creative. Returns false when the product photo could not be loaded. */
export async function renderToStorage(r: ResolvedDesign, ext: 'jpg' | 'png', quality: number, key: string): Promise<boolean> {
  const { buf, missing } = await renderResolved(r, ext, quality);
  const mainMissing = r.layers.some(
    (l) => l.visible && l.layer.type === 'image' && l.layer.source.kind === 'field' && l.url && missing.includes(l.url),
  );
  if (mainMissing) return false;
  const { put } = await import('../storage');
  await put(key, buf);
  return true;
}
