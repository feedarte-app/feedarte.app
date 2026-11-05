import crypto from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, schema } from './db';
import { HttpError, requireUser } from './auth';
import { getProject, isUuid } from './access';
import * as storage from './storage';
import { FontError, readFont } from './fontinfo';
import type { CustomFont, DesignDoc } from '../shared/types';
import { queueRender } from './feed/sync';
import { ensureFonts, registerFonts, type FontRef } from './render/engine';
import { createCanvas } from '@napi-rs/canvas';
import { FONTS } from '../shared/fonts';

const MAX_FONTS_PER_PROJECT = 60;

export async function projectFonts(projectId: string): Promise<CustomFont[]> {
  const rows = await db.select().from(schema.fonts).where(eq(schema.fonts.projectId, projectId)).orderBy(asc(schema.fonts.family), asc(schema.fonts.weight));
  return rows.map((r) => ({ id: r.id, family: r.family, cssFamily: r.cssFamily, weight: r.weight, weightMax: r.weightMax, italic: r.italic, url: `/${r.key}`, key: r.key }));
}

/** families referenced by a design: text layers + text fallbacks of image layers */
export function familiesOf(doc: DesignDoc): Set<string> {
  const s = new Set<string>();
  for (const l of doc.layers) {
    if (l.type === 'text') s.add(l.font);
    if (l.type === 'image' && l.fallback?.mode === 'text' && l.fallback.font) s.add(l.fallback.font);
  }
  return s;
}

export function fontsUsedBy(doc: DesignDoc, fonts: CustomFont[]): FontRef[] {
  const fam = familiesOf(doc);
  return fonts.filter((f) => fam.has(f.cssFamily)).map((f) => ({ cssFamily: f.cssFamily, key: f.key! }));
}

async function rerenderProjectDesignsUsing(projectId: string, cssFamily: string) {
  const rows = await db
    .select({ id: schema.designs.id, published: schema.designs.published })
    .from(schema.designs)
    .innerJoin(schema.feeds, eq(schema.feeds.id, schema.designs.feedId))
    .where(eq(schema.feeds.projectId, projectId));
  for (const d of rows) if (d.published && familiesOf(d.published as DesignDoc).has(cssFamily)) await queueRender(d.id);
}

const previewCache = new Map<string, Buffer>();

export async function fontRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  /** small PNG with the family name drawn in that family — for the font picker (no need to download every font) */
  app.get('/api/font-preview', async (req, reply) => {
    const q = req.query as { family?: string; label?: string };
    const family = String(q.family ?? '').slice(0, 80);
    if (!family) throw new HttpError(400, 'family');
    let label = String(q.label ?? family).slice(0, 60);
    if (family.startsWith('cf_')) {
      const [row] = await db.select().from(schema.fonts).where(eq(schema.fonts.cssFamily, family)).limit(1);
      if (!row) throw new HttpError(404, 'Не знайдено');
      await getProject(req.user!, row.projectId);
      ensureFonts(await db.select({ cssFamily: schema.fonts.cssFamily, key: schema.fonts.key }).from(schema.fonts).where(eq(schema.fonts.cssFamily, family)));
      label = row.family;
    } else if (!FONTS.some((f) => f.family === family)) throw new HttpError(404, 'Не знайдено');
    const ck = `${family}|${label}`;
    let png = previewCache.get(ck);
    if (!png) {
      registerFonts();
      const H = 64;
      const measureCtx = createCanvas(10, 10).getContext('2d');
      const font = `400 40px "${family}", "Inter"`;
      measureCtx.font = font;
      const w = Math.min(640, Math.ceil(measureCtx.measureText(label).width) + 8);
      const c = createCanvas(w, H);
      const g = c.getContext('2d');
      g.font = font;
      g.fillStyle = '#16161a';
      g.textBaseline = 'middle';
      g.fillText(label, 2, H / 2 + 2);
      png = c.toBuffer('image/png');
      if (previewCache.size > 500) previewCache.clear();
      previewCache.set(ck, png);
    }
    reply.header('content-type', 'image/png').header('cache-control', 'private, max-age=86400');
    return reply.send(png);
  });

  app.get('/api/projects/:id/fonts', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    return { fonts: await projectFonts(p.id) };
  });

  /** upload one or several TTF/OTF/WOFF files */
  app.post('/api/projects/:id/fonts', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const existing = await projectFonts(p.id);
    const added: CustomFont[] = [];
    const errors: string[] = [];
    const touched = new Set<string>();
    for await (const file of req.files({ limits: { fileSize: 15 * 1024 * 1024, files: 30 } })) {
      const name = file.filename || 'font';
      const buf = await file.toBuffer();
      if (file.file.truncated) {
        errors.push(`${name}: файл більший за 15 МБ`);
        continue;
      }
      if (existing.length + added.length >= MAX_FONTS_PER_PROJECT) {
        errors.push(`${name}: забагато шрифтів у проєкті (максимум ${MAX_FONTS_PER_PROJECT})`);
        continue;
      }
      let info;
      try {
        info = readFont(buf);
      } catch (e) {
        errors.push(`${name}: ${e instanceof FontError ? e.message : 'не вдалося прочитати шрифт'}`);
        continue;
      }
      // same family in this project → same internal name, so weights/styles combine
      const cssFamily = [...existing, ...added].find((f) => f.family.toLowerCase() === info.family.toLowerCase())?.cssFamily ?? `cf_${crypto.createHash('sha1').update(p.id + '|' + info.family.toLowerCase()).digest('hex').slice(0, 10)}`;
      const dup = [...existing, ...added].find((f) => f.cssFamily === cssFamily && f.weight === (info.weightRange?.[0] ?? info.weight) && f.italic === info.italic);
      const key = `a/${crypto.randomUUID()}.${info.format}`;
      await storage.put(key, info.sfnt);
      if (dup) {
        // replacing the same weight/style: drop the old file
        await db.delete(schema.fonts).where(eq(schema.fonts.id, dup.id));
        if (dup.key) await storage.remove(dup.key).catch(() => {});
      }
      const [row] = await db
        .insert(schema.fonts)
        .values({
          projectId: p.id,
          family: info.family,
          cssFamily,
          subfamily: info.subfamily,
          weight: info.weightRange?.[0] ?? info.weight,
          weightMax: info.weightRange?.[1] ?? null,
          italic: info.italic,
          key,
          size: info.sfnt.length,
        })
        .returning();
      added.push({ id: row.id, family: row.family, cssFamily, weight: row.weight, weightMax: row.weightMax, italic: row.italic, url: `/${key}`, key });
      if (!info.hasUkrainian) errors.push(`${name}: у шрифті немає українських літер (і, ї, є, ґ) — вони відобразяться запасним шрифтом`);
      if (dup) touched.add(cssFamily);
    }
    for (const fam of touched) await rerenderProjectDesignsUsing(p.id, fam);
    if (!added.length && errors.length) throw new HttpError(400, errors.join('\n'));
    req.log.info({ projectId: p.id, added: added.length }, 'fonts uploaded');
    return { added, warnings: errors, fonts: await projectFonts(p.id) };
  });

  app.delete('/api/projects/:id/fonts/:fontId', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const fontId = (req.params as any).fontId;
    if (!isUuid(fontId)) throw new HttpError(404, 'Не знайдено');
    const [row] = await db.delete(schema.fonts).where(and(eq(schema.fonts.id, fontId), eq(schema.fonts.projectId, p.id))).returning();
    if (!row) throw new HttpError(404, 'Не знайдено');
    await storage.remove(row.key).catch(() => {});
    await rerenderProjectDesignsUsing(p.id, row.cssFamily);
    return { ok: true, fonts: await projectFonts(p.id) };
  });
}
