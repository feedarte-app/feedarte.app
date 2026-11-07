import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import path from 'node:path';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, schema, sqlClient as sql } from '../db';
import { HttpError, requireUser } from '../auth';
import { getDesign, getProject, isUuid } from '../access';
import { fetchImageBytes, readIcon, renderProduct } from '../render/engine';
import { fontsUsedBy, projectFonts } from '../fonts';
import { iconSvg } from '../../shared/render';
import * as storage from '../storage';
import { cacheDir } from '../storage';

const require_ = createRequire(import.meta.url);
let iconNames: string[] | null = null;
function allIcons(): string[] {
  if (!iconNames) {
    const dir = path.join(path.dirname(require_.resolve('lucide-static/package.json')), 'icons');
    iconNames = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.slice(0, -4))
      .sort();
  }
  return iconNames;
}

function sniff(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  const head = buf.slice(0, 512).toString('utf8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return 'application/octet-stream';
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' };

// ---- downscaled copies for the editor (disk-cached, deduplicated while in flight) ----
const smallInFlight = new Map<string, Promise<{ buf: Buffer; type: string } | null>>();
async function downscaled(url: string, max: number): Promise<{ buf: Buffer; type: string } | null> {
  const h = crypto.createHash('sha1').update(`${url}#${max}`).digest('hex');
  const cp = path.join(cacheDir, 'img-s', h.slice(0, 2), `${h}.webp`);
  try {
    return { buf: await fsp.readFile(cp), type: 'image/webp' };
  } catch {
    /* miss */
  }
  let p = smallInFlight.get(cp);
  if (!p) {
    p = (async () => {
      const src = await fetchImageBytes(url);
      const type = sniff(src);
      if (type !== 'image/jpeg' && type !== 'image/png' && type !== 'image/webp') return null; // svg/gif: as is
      const img = await loadImage(src);
      const k = Math.min(1, max / Math.max(img.width, img.height));
      if (k >= 1 && src.length < 400 * 1024) return null; // already small
      const w = Math.max(1, Math.round(img.width * k));
      const hgt = Math.max(1, Math.round(img.height * k));
      const c = createCanvas(w, hgt);
      c.getContext('2d').drawImage(img, 0, 0, w, hgt);
      const buf = await c.encode('webp', 82);
      await fsp.mkdir(path.dirname(cp), { recursive: true });
      await fsp.writeFile(cp + '.tmp', buf);
      await fsp.rename(cp + '.tmp', cp);
      return { buf, type: 'image/webp' };
    })().finally(() => smallInFlight.delete(cp));
    smallInFlight.set(cp, p);
  }
  return p;
}

export async function mediaRoutes(app: FastifyInstance) {
  // Image proxy for the editor (avoids CORS/hotlink issues; shares the renderer's disk cache)
  app.get('/api/img', { preHandler: requireUser }, async (req, reply) => {
    const { url, max } = z.object({ url: z.string().min(1).max(4000), max: z.coerce.number().int().min(64).max(4096).optional() }).parse(req.query);
    if (max) {
      // editor preview: a downscaled copy (product photos are often 3–5 MB) — much faster to show
      const small = await downscaled(url, max).catch((e) => {
        throw new HttpError(502, `Не вдалося завантажити зображення: ${(e as Error).message}`);
      });
      if (small) {
        reply.header('content-type', small.type).header('cache-control', 'private, max-age=86400');
        return reply.send(small.buf);
      }
    }
    let buf: Buffer;
    try {
      buf = await fetchImageBytes(url);
    } catch (e) {
      throw new HttpError(502, `Не вдалося завантажити зображення: ${(e as Error).message}`);
    }
    const type = sniff(buf);
    if (type === 'application/octet-stream') throw new HttpError(415, 'Не зображення');
    reply.header('content-type', type).header('cache-control', 'private, max-age=86400');
    if (type === 'image/svg+xml') reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply.send(buf);
  });

  app.get('/api/icons', { preHandler: requireUser }, async () => ({ icons: allIcons() }));

  app.get('/api/icons/:name', async (req, reply) => {
    const name = String((req.params as any).name).replace(/\.svg$/, '');
    const q = req.query as any;
    const raw = readIcon(name);
    if (!raw) throw new HttpError(404, 'Іконку не знайдено');
    const color = /^#[0-9a-f]{3,8}$/i.test(q.color ?? '') ? q.color : '#000000';
    const sw = Math.min(4, Math.max(0.5, Number(q.sw ?? 2) || 2));
    reply.header('content-type', 'image/svg+xml').header('cache-control', 'public, max-age=86400');
    return reply.send(iconSvg(raw, color, sw, 512));
  });

  // Server-side preview of the current draft for one product — proves editor == output
  app.get('/api/designs/:id/preview/:productId', { preHandler: requireUser }, async (req, reply) => {
    const { design, project } = await getDesign(req.user!, (req.params as any).id);
    const pid = Number((req.params as any).productId);
    const [row] = await sql`select data from products where id = ${pid} and feed_id = ${design.feedId}`;
    if (!row) throw new HttpError(404, 'Товар не знайдено');
    const fonts = fontsUsedBy(design.draft, await projectFonts(project.id));
    const { buf } = await renderProduct(design.draft, row.data, 'jpg', project.logoMaps, fonts);
    reply.header('content-type', 'image/jpeg').header('cache-control', 'no-store');
    return reply.send(buf);
  });

  // ---------- uploaded assets (logos, badges, backgrounds) ----------
  app.get('/api/projects/:id/assets', { preHandler: requireUser }, async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const rows = await db.select().from(schema.assets).where(eq(schema.assets.projectId, p.id)).orderBy(desc(schema.assets.createdAt));
    return { assets: rows.map((a) => ({ ...a, url: `/${a.key}` })) };
  });

  app.post('/api/projects/:id/assets', { preHandler: requireUser }, async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } });
    if (!file) throw new HttpError(400, 'Файл не передано');
    const buf = await file.toBuffer();
    const type = sniff(buf);
    const ext = EXT[type];
    if (!ext) throw new HttpError(415, 'Підтримуються PNG, JPG, WEBP, SVG, GIF');
    const key = `a/${crypto.randomUUID()}.${ext}`;
    await storage.put(key, buf);
    const [a] = await db
      .insert(schema.assets)
      .values({ projectId: p.id, name: (file.filename || 'image').slice(0, 200), key, mime: type, size: buf.length })
      .returning();
    return { asset: { ...a, url: `/${key}` } };
  });

  app.delete('/api/assets/:id', { preHandler: requireUser }, async (req) => {
    const id = (req.params as any).id;
    if (!isUuid(id)) throw new HttpError(404, 'Не знайдено');
    const a = await db.query.assets.findFirst({ where: eq(schema.assets.id, id) });
    if (!a || !a.projectId) throw new HttpError(404, 'Не знайдено');
    await getProject(req.user!, a.projectId);
    await db.delete(schema.assets).where(eq(schema.assets.id, id));
    await storage.remove(a.key);
    return { ok: true };
  });
}
