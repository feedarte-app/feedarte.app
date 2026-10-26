import { z } from 'zod';
import crypto from 'node:crypto';
import { and, desc, eq, sql as dsql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, schema, sqlClient as sql } from '../db';
import { HttpError, requireUser } from '../auth';
import { getDesign, getFeed, getProject } from '../access';
import { queueRender, queueSync } from '../feed/sync';
import { assertPublicUrl } from '../net';
import { DEFAULT_OUTPUT } from '../db/schema';
import { FORMATS } from '../../shared/types';
import { newDoc } from '../../shared/render';
import { builtinTemplates } from '../templates/builtin';
import * as storage from '../storage';

const docSchema = z
  .object({
    width: z.number().int().min(100).max(4000),
    height: z.number().int().min(100).max(4000),
    background: z.any(),
    layers: z.array(z.any()).max(300),
    format: z.any(),
  })
  .passthrough();

const conditionSchema = z
  .object({
    action: z.enum(['show', 'hide']),
    mode: z.enum(['all', 'any']),
    rules: z.array(z.object({ field: z.string(), op: z.string(), value: z.string().optional() })),
  })
  .nullable();

const token = () => crypto.randomBytes(12).toString('base64url');

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  // ---------- projects ----------
  app.get('/api/projects', async (req) => {
    const u = req.user!;
    const rows = await sql`
      select p.id, p.name, p.created_at as "createdAt", p.owner_id as "ownerId", u.email as "ownerEmail",
        (select count(*)::int from feeds f where f.project_id = p.id) as "feedCount",
        (select count(*)::int from designs d join feeds f on f.id = d.feed_id where f.project_id = p.id) as "designCount",
        (select coalesce(sum(f.product_count),0)::int from feeds f where f.project_id = p.id) as "productCount",
        (select count(*)::int from feeds f where f.project_id = p.id and f.status = 'error') as "errorCount"
      from projects p join users u on u.id = p.owner_id
      where ${u.role === 'admin'} or p.owner_id = ${u.id}
      order by p.created_at desc`;
    return { projects: rows };
  });

  app.post('/api/projects', async (req) => {
    const body = z.object({ name: z.string().trim().min(1, 'Вкажіть назву').max(120) }).parse(req.body);
    const [p] = await db.insert(schema.projects).values({ name: body.name, ownerId: req.user!.id }).returning();
    return { project: p };
  });

  app.get('/api/projects/:id', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const feeds = await db.select().from(schema.feeds).where(eq(schema.feeds.projectId, p.id)).orderBy(schema.feeds.createdAt);
    const designs = await db
      .select({
        id: schema.designs.id,
        feedId: schema.designs.feedId,
        name: schema.designs.name,
        thumbnail: schema.designs.thumbnail,
        formatId: schema.designs.formatId,
      })
      .from(schema.designs)
      .innerJoin(schema.feeds, eq(schema.feeds.id, schema.designs.feedId))
      .where(eq(schema.feeds.projectId, p.id));
    return {
      project: p,
      feeds: feeds.map(({ fields, ...f }) => ({ ...f, fieldCount: fields.length, designs: designs.filter((d) => d.feedId === f.id) })),
    };
  });

  app.patch('/api/projects/:id', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const body = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body);
    await db.update(schema.projects).set({ name: body.name }).where(eq(schema.projects.id, p.id));
    return { ok: true };
  });

  app.delete('/api/projects/:id', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const designIds = await sql`select d.id, d.public_token from designs d join feeds f on f.id = d.feed_id where f.project_id = ${p.id}`;
    await db.delete(schema.projects).where(eq(schema.projects.id, p.id));
    for (const d of designIds) {
      await storage.remove(`r/${d.id}`);
      await storage.remove(`feeds/${d.public_token}.xml`);
    }
    return { ok: true };
  });

  // ---------- feeds ----------
  const feedBody = z.object({
    name: z.string().trim().min(1, 'Вкажіть назву').max(120),
    sourceUrl: z.string().trim().url('Некоректне посилання'),
    intervalMinutes: z.number().int().min(15).max(1440).default(60),
  });

  app.post('/api/projects/:id/feeds', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const body = feedBody.parse(req.body);
    try {
      await assertPublicUrl(body.sourceUrl);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const [f] = await db
      .insert(schema.feeds)
      .values({ ...body, projectId: p.id, nextSyncAt: new Date(Date.now() + body.intervalMinutes * 60000) })
      .returning();
    await queueSync(f.id, 1);
    return { feed: f };
  });

  app.get('/api/feeds/:id', async (req) => {
    const { feed, project } = await getFeed(req.user!, (req.params as any).id);
    const designs = await db
      .select()
      .from(schema.designs)
      .where(eq(schema.designs.feedId, feed.id))
      .orderBy(schema.designs.createdAt);
    const runs = await db
      .select()
      .from(schema.syncRuns)
      .where(eq(schema.syncRuns.feedId, feed.id))
      .orderBy(desc(schema.syncRuns.startedAt))
      .limit(20);
    return {
      feed,
      project: { id: project.id, name: project.name },
      designs: designs.map(({ draft, published, ...d }) => ({
        ...d,
        hasUnpublished: JSON.stringify(draft) !== JSON.stringify(published),
        isPublished: !!published,
        outputUrl: storage.publicUrl(`feeds/${d.publicToken}.xml`),
      })),
      runs,
    };
  });

  app.patch('/api/feeds/:id', async (req) => {
    const { feed } = await getFeed(req.user!, (req.params as any).id);
    const body = feedBody.partial().extend({ enabled: z.boolean().optional() }).parse(req.body);
    if (body.sourceUrl) {
      try {
        await assertPublicUrl(body.sourceUrl);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    }
    await db.update(schema.feeds).set(body).where(eq(schema.feeds.id, feed.id));
    if (body.sourceUrl && body.sourceUrl !== feed.sourceUrl) await queueSync(feed.id, 1, true);
    return { ok: true };
  });

  app.delete('/api/feeds/:id', async (req) => {
    const { feed } = await getFeed(req.user!, (req.params as any).id);
    const ds = await db.select().from(schema.designs).where(eq(schema.designs.feedId, feed.id));
    await db.delete(schema.feeds).where(eq(schema.feeds.id, feed.id));
    for (const d of ds) {
      await storage.remove(`r/${d.id}`);
      await storage.remove(`feeds/${d.publicToken}.xml`);
    }
    return { ok: true };
  });

  app.post('/api/feeds/:id/sync', async (req) => {
    const { feed } = await getFeed(req.user!, (req.params as any).id);
    await queueSync(feed.id, 1, true);
    return { ok: true };
  });

  app.get('/api/feeds/:id/products', async (req) => {
    const { feed } = await getFeed(req.user!, (req.params as any).id);
    const q = z
      .object({
        q: z.string().optional(),
        filter: z.enum(['all', 'discount', 'nodiscount']).default('all'),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, (m) => '\\' + m)}%` : null;
    const disc =
      q.filter === 'discount'
        ? dsql`and coalesce(data->>'sale_price', '') <> ''`
        : q.filter === 'nodiscount'
          ? dsql`and coalesce(data->>'sale_price', '') = ''`
          : dsql``;
    const where = dsql`feed_id = ${feed.id} ${like ? dsql`and (title ilike ${like} or external_id ilike ${like})` : dsql``} ${disc}`;
    const rows = await db.execute(
      dsql`select id, external_id as "externalId", title, data from products where ${where} order by position limit ${q.limit} offset ${q.offset}`,
    );
    const [cnt] = await db.execute(dsql`select count(*)::int as c from products where ${where}`);
    return { products: rows, total: (cnt as any).c };
  });

  // ---------- designs ----------
  app.post('/api/feeds/:id/designs', async (req) => {
    const { feed } = await getFeed(req.user!, (req.params as any).id);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        formatId: z.string().default('square'),
        templateId: z.string().optional(),
        width: z.number().int().min(200).max(4000).optional(),
        height: z.number().int().min(200).max(4000).optional(),
      })
      .parse(req.body);
    const fmt = FORMATS.find((f) => f.id === body.formatId);
    let doc = newDoc(body.width ?? fmt?.w ?? 1080, body.height ?? fmt?.h ?? 1080);
    if (body.templateId) {
      const bt = builtinTemplates().find((t) => t.id === body.templateId);
      if (bt) doc = structuredClone(bt.doc);
      else {
        const t = await db.query.templates.findFirst({ where: eq(schema.templates.id, body.templateId) });
        if (t && (t.ownerId === null || t.ownerId === req.user!.id || req.user!.role === 'admin')) doc = structuredClone(t.doc);
      }
    }
    const [d] = await db
      .insert(schema.designs)
      .values({ feedId: feed.id, name: body.name, formatId: body.formatId, draft: doc, publicToken: token(), output: DEFAULT_OUTPUT })
      .returning();
    return { design: d };
  });

  app.get('/api/designs/:id', async (req) => {
    const { design, feed, project } = await getDesign(req.user!, (req.params as any).id);
    return {
      design: { ...design, outputUrl: storage.publicUrl(`feeds/${design.publicToken}.xml`) },
      feed: { id: feed.id, name: feed.name, fields: feed.fields, productCount: feed.productCount, status: feed.status },
      project: { id: project.id, name: project.name },
    };
  });

  app.put('/api/designs/:id/draft', { bodyLimit: 5 * 1024 * 1024 }, async (req) => {
    const { design } = await getDesign(req.user!, (req.params as any).id);
    const body = z.object({ doc: docSchema }).parse(req.body);
    await db
      .update(schema.designs)
      .set({ draft: body.doc as any, updatedAt: new Date() })
      .where(eq(schema.designs.id, design.id));
    return { ok: true };
  });

  app.post('/api/designs/:id/publish', async (req) => {
    const { design } = await getDesign(req.user!, (req.params as any).id);
    await db
      .update(schema.designs)
      .set({ published: design.draft, version: design.version + 1, publishedAt: new Date() })
      .where(eq(schema.designs.id, design.id));
    await queueRender(design.id, 1);
    return { ok: true, version: design.version + 1 };
  });

  app.post('/api/designs/:id/discard', async (req) => {
    const { design } = await getDesign(req.user!, (req.params as any).id);
    if (!design.published) throw new HttpError(400, 'Дизайн ще не публікувався');
    await db.update(schema.designs).set({ draft: design.published }).where(eq(schema.designs.id, design.id));
    return { doc: design.published };
  });

  app.post('/api/designs/:id/render', async (req) => {
    const { design } = await getDesign(req.user!, (req.params as any).id);
    if (!design.published) throw new HttpError(400, 'Спершу опублікуйте дизайн');
    await queueRender(design.id, 1);
    return { ok: true };
  });

  app.patch('/api/designs/:id', async (req) => {
    const { design } = await getDesign(req.user!, (req.params as any).id);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        active: z.boolean().optional(),
        output: z
          .object({
            filter: conditionSchema,
            mode: z.enum(['only', 'all']),
            keepOriginalAsAdditional: z.boolean(),
            imageFormat: z.enum(['jpg', 'png']),
            quality: z.number().int().min(50).max(100),
          })
          .partial()
          .optional(),
      })
      .parse(req.body);
    const output = body.output ? { ...DEFAULT_OUTPUT, ...design.output, ...body.output } : undefined;
    await db
      .update(schema.designs)
      .set({ name: body.name, active: body.active, output: output as any })
      .where(eq(schema.designs.id, design.id));
    if ((body.output || body.active === true) && design.published) await queueRender(design.id, 2);
    return { ok: true };
  });

  app.post('/api/designs/:id/duplicate', async (req) => {
    const { design } = await getDesign(req.user!, (req.params as any).id);
    const [d] = await db
      .insert(schema.designs)
      .values({
        feedId: design.feedId,
        name: `${design.name} (копія)`,
        formatId: design.formatId,
        draft: design.draft,
        output: design.output,
        publicToken: token(),
      })
      .returning();
    return { design: d };
  });

  app.delete('/api/designs/:id', async (req) => {
    const { design } = await getDesign(req.user!, (req.params as any).id);
    await db.delete(schema.designs).where(eq(schema.designs.id, design.id));
    await storage.remove(`r/${design.id}`);
    await storage.remove(`feeds/${design.publicToken}.xml`);
    return { ok: true };
  });

  // ---------- templates ----------
  app.get('/api/templates', async (req) => {
    const own = await db
      .select()
      .from(schema.templates)
      .where(req.user!.role === 'admin' ? dsql`true` : dsql`${schema.templates.ownerId} = ${req.user!.id} or ${schema.templates.ownerId} is null`)
      .orderBy(desc(schema.templates.createdAt));
    return {
      templates: [
        ...builtinTemplates().map((t) => ({ ...t, builtin: true })),
        ...own.map((t) => ({ id: t.id, name: t.name, formatId: t.formatId, doc: t.doc, builtin: false, shared: t.ownerId === null })),
      ],
    };
  });

  app.post('/api/templates', async (req) => {
    const body = z
      .object({ name: z.string().trim().min(1).max(120), formatId: z.string(), doc: docSchema, shared: z.boolean().default(false) })
      .parse(req.body);
    const shared = body.shared && req.user!.role === 'admin';
    const [t] = await db
      .insert(schema.templates)
      .values({ name: body.name, formatId: body.formatId, doc: body.doc as any, ownerId: shared ? null : req.user!.id })
      .returning();
    return { template: t };
  });

  app.delete('/api/templates/:id', async (req) => {
    const id = (req.params as any).id;
    const t = await db.query.templates.findFirst({ where: eq(schema.templates.id, id) });
    if (!t) throw new HttpError(404, 'Шаблон не знайдено');
    if (t.ownerId !== req.user!.id && req.user!.role !== 'admin') throw new HttpError(403, 'Немає доступу');
    await db.delete(schema.templates).where(and(eq(schema.templates.id, id)));
    return { ok: true };
  });
}
