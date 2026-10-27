import crypto from 'node:crypto';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { HttpError, requireUser } from '../auth';
import { getProject } from '../access';
import { env } from '../env';
import { escapeHtml as esc, letter, mailEnabled, sendMail } from '../mail';

const TTL_DAYS = 7;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const linkFor = (token: string) => `${env.publicUrl}/transfer/${token}`;

type Transfer = typeof schema.projectTransfers.$inferSelect;
const isExpired = (t: Transfer) => t.expiresAt.getTime() < Date.now();

function publicView(t: Transfer) {
  return {
    id: t.id,
    toEmail: t.toEmail,
    status: t.status === 'pending' && isExpired(t) ? 'expired' : t.status,
    emailSent: t.emailSent,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
  };
}

async function pendingFor(projectId: string) {
  return db.query.projectTransfers.findFirst({
    where: and(eq(schema.projectTransfers.projectId, projectId), eq(schema.projectTransfers.status, 'pending')),
  });
}

async function emailOf(userId: string) {
  return (await db.query.users.findFirst({ where: eq(schema.users.id, userId) }))?.email ?? '';
}

/** Sends the invitation; returns true if it went out. Never throws — the link is shown to the sender as a fallback. */
async function sendInvite(t: Transfer, token: string, projectName: string, fromEmail: string, log: (e: unknown) => void) {
  if (!(await mailEnabled())) return false;
  const l = letter({
    title: 'Вам передають проєкт у Feedarte',
    lines: [
      `<b>${esc(fromEmail)}</b> хоче передати вам проєкт <b>«${esc(projectName)}»</b> разом з усіма фідами, дизайнами й картинками.`,
      `Щоб прийняти, відкрийте посилання і увійдіть (або зареєструйтесь) під цією поштою — <b>${esc(t.toEmail)}</b>.`,
      `Посилання дійсне ${TTL_DAYS} днів.`,
    ],
    button: { label: 'Переглянути й прийняти', url: linkFor(token) },
    footer: 'Якщо ви не чекали цього листа — просто проігноруйте його, нічого не зміниться.',
  });
  try {
    await sendMail({ to: t.toEmail, subject: `Передача проєкту «${projectName}» у Feedarte`, ...l });
    await db.update(schema.projectTransfers).set({ emailSent: true }).where(eq(schema.projectTransfers.id, t.id));
    return true;
  } catch (e) {
    log(e);
    return false;
  }
}

export async function transferRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);
  const limited = { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } };

  // ---- owner side ----
  app.get('/api/projects/:id/transfer', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const t = await pendingFor(p.id);
    return { transfer: t ? publicView(t) : null, mailEnabled: await mailEnabled() };
  });

  /** start (or restart — a new link, the old one stops working) a transfer */
  app.post('/api/projects/:id/transfer', limited, async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    const { email } = z.object({ email: z.string().trim().toLowerCase().email('Некоректний email').max(200) }).parse(req.body);
    const ownerEmail = await emailOf(p.ownerId);
    if (email === ownerEmail.toLowerCase()) throw new HttpError(400, 'Проєкт уже належить цьому акаунту');

    const token = crypto.randomBytes(32).toString('base64url');
    const t = await db.transaction(async (tx) => {
      await tx
        .update(schema.projectTransfers)
        .set({ status: 'cancelled', decidedAt: new Date() })
        .where(and(eq(schema.projectTransfers.projectId, p.id), eq(schema.projectTransfers.status, 'pending')));
      const [row] = await tx
        .insert(schema.projectTransfers)
        .values({ projectId: p.id, fromUserId: req.user!.id, toEmail: email, tokenHash: sha(token), expiresAt: new Date(Date.now() + TTL_DAYS * 86400_000) })
        .returning();
      return row;
    });
    const sent = await sendInvite(t, token, p.name, ownerEmail, (e) => req.log.error(e, 'transfer email failed'));
    req.log.info({ projectId: p.id, to: email, sent }, 'project transfer started');
    // the link itself is only returned when no email went out, so the owner can pass it on manually
    return { transfer: publicView({ ...t, emailSent: sent }), link: sent ? null : linkFor(token) };
  });

  app.delete('/api/projects/:id/transfer', async (req) => {
    const p = await getProject(req.user!, (req.params as any).id);
    await db
      .update(schema.projectTransfers)
      .set({ status: 'cancelled', decidedAt: new Date() })
      .where(and(eq(schema.projectTransfers.projectId, p.id), eq(schema.projectTransfers.status, 'pending')));
    return { ok: true };
  });

  // ---- recipient side ----
  const byToken = async (token: string) => {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    return db.query.projectTransfers.findFirst({ where: eq(schema.projectTransfers.tokenHash, sha(token)) });
  };

  app.get('/api/transfers/:token', async (req) => {
    const t = await byToken((req.params as any).token);
    if (!t) throw new HttpError(404, 'Посилання недійсне');
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, t.projectId) });
    return {
      transfer: publicView(t),
      projectId: t.status === 'accepted' && t.acceptedBy === req.user!.id ? t.projectId : null,
      projectName: project?.name ?? '',
      fromEmail: await emailOf(t.fromUserId),
      youAre: req.user!.email,
      matches: req.user!.email.toLowerCase() === t.toEmail.toLowerCase(),
    };
  });

  app.post('/api/transfers/:token/:action', limited, async (req) => {
    const { token, action } = req.params as { token: string; action: string };
    if (action !== 'accept' && action !== 'decline') throw new HttpError(404, 'Not found');
    const found = await byToken(token);
    if (!found) throw new HttpError(404, 'Посилання недійсне');
    const me = req.user!;
    if (me.email.toLowerCase() !== found.toEmail.toLowerCase())
      throw new HttpError(403, `Це запрошення для ${found.toEmail}. Увійдіть під цією поштою.`);

    const result = await db.transaction(async (tx) => {
      // lock the row so two clicks can't both succeed
      const [t] = await tx.select().from(schema.projectTransfers).where(eq(schema.projectTransfers.id, found.id)).for('update');
      if (!t || t.status !== 'pending') throw new HttpError(409, 'Це запрошення вже неактуальне');
      if (isExpired(t)) throw new HttpError(410, 'Термін дії посилання минув — попросіть надіслати нове');
      const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, t.projectId)).for('update');
      if (!project) throw new HttpError(404, 'Проєкт уже видалено');
      const prevOwner = project.ownerId;
      if (action === 'accept') {
        await tx.update(schema.projects).set({ ownerId: me.id }).where(eq(schema.projects.id, project.id));
        await tx.update(schema.projectTransfers).set({ status: 'accepted', decidedAt: new Date(), acceptedBy: me.id }).where(eq(schema.projectTransfers.id, t.id));
      } else {
        await tx.update(schema.projectTransfers).set({ status: 'declined', decidedAt: new Date() }).where(eq(schema.projectTransfers.id, t.id));
      }
      return { project, prevOwner, fromUserId: t.fromUserId };
    });
    req.log.info({ projectId: result.project.id, to: me.id, action }, 'project transfer decided');

    // let the previous owner (and whoever started it) know — best effort
    if (await mailEnabled()) {
      const notify = new Set([result.prevOwner, result.fromUserId]);
      notify.delete(me.id);
      for (const uid of notify) {
        const to = await emailOf(uid);
        if (!to) continue;
        const accepted = action === 'accept';
        const l = letter({
          title: accepted ? 'Проєкт передано' : 'Передачу проєкту відхилено',
          lines: accepted
            ? [`<b>${esc(me.email)}</b> прийняв(-ла) проєкт <b>«${esc(result.project.name)}»</b>. Тепер він у новому акаунті, а вихідні фіди продовжують працювати за тими самими посиланнями.`]
            : [`<b>${esc(me.email)}</b> відхилив(-ла) передачу проєкту <b>«${esc(result.project.name)}»</b>. Проєкт залишається у вас.`],
        });
        sendMail({ to, subject: accepted ? `Проєкт «${result.project.name}» передано` : `Передачу «${result.project.name}» відхилено`, ...l }).catch((e) =>
          req.log.error(e, 'transfer notify failed'),
        );
      }
    }
    return { ok: true, projectId: action === 'accept' ? result.project.id : null };
  });
}
