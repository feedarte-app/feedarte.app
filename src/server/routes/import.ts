import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { HttpError, requireUser } from '../auth';
import { getFeed } from '../access';
import { DEFAULT_OUTPUT } from '../db/schema';
import { FORMATS } from '../../shared/types';
import { importFromFigma, type ImportResult } from '../import/figma';
import { importFromImage } from '../import/image-ai';
import { getIntegrationKeys, ImportError } from '../import/common';
import crypto from 'node:crypto';
import { log } from '../log';

const token = () => crypto.randomBytes(12).toString('base64url');

async function createDesign(feedId: string, name: string, formatId: string, r: ImportResult) {
  const [d] = await db
    .insert(schema.designs)
    .values({ feedId, name, formatId, draft: r.doc, publicToken: token(), output: DEFAULT_OUTPUT })
    .returning();
  return { design: d, notes: r.notes, stats: r.stats };
}

function wrap(e: unknown): never {
  if (e instanceof ImportError || e instanceof HttpError) throw e;
  log.error({ err: String(e) }, 'import failed');
  throw new HttpError(502, `Імпорт не вдався: ${e instanceof Error ? e.message : e}`);
}

export async function importRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);
  const limited = { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } };

  app.get('/api/integrations', async () => {
    const k = await getIntegrationKeys();
    return { figma: !!k.figmaToken, ai: !!k.anthropicKey };
  });

  app.post('/api/feeds/:id/designs/import/figma', limited, async (req) => {
    const { feed, project } = await getFeed(req.user!, (req.params as any).id);
    const b = z
      .object({ name: z.string().trim().min(1).max(120), formatId: z.string().default('square'), url: z.string().trim().min(10, 'Вставте посилання на фрейм Figma') })
      .parse(req.body);
    const fmt = FORMATS.find((f) => f.id === b.formatId) ?? FORMATS[0];
    const k = await getIntegrationKeys();
    try {
      const r = await importFromFigma({ url: b.url, token: k.figmaToken, projectId: project.id, width: fmt.w });
      return await createDesign(feed.id, b.name, b.formatId, r);
    } catch (e) {
      wrap(e);
    }
  });

  app.post('/api/feeds/:id/designs/import/image', limited, async (req) => {
    const { feed, project } = await getFeed(req.user!, (req.params as any).id);
    const fields: Record<string, string> = {};
    let file: Buffer | null = null;
    for await (const part of req.parts({ limits: { fileSize: 15 * 1024 * 1024, files: 1 } })) {
      if (part.type === 'file') file = await part.toBuffer();
      else fields[part.fieldname] = String(part.value ?? '');
    }
    if (!file) throw new HttpError(400, 'Завантажте зображення макета');
    const name = (fields.name || 'Імпортований дизайн').slice(0, 120);
    const formatId = fields.formatId || 'square';
    const fmt = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
    const k = await getIntegrationKeys();
    try {
      const r = await importFromImage({ file, projectId: project.id, width: fmt.w, apiKey: k.anthropicKey, model: process.env.ANTHROPIC_MODEL });
      return await createDesign(feed.id, name, formatId, r);
    } catch (e) {
      wrap(e);
    }
  });
}
