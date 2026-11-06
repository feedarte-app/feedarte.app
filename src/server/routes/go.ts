// Public click-through for "link to Instagram Direct" feeds:
//   /go/<design public token | catalog token>/<product id>
// Counts the click per product, shows which product the person asked about and opens the shop's
// Instagram Direct (https://ig.me/m/<username> — the official deep link that opens the chat in the app).
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient as sql } from '../db';
import { env } from '../env';
import type { ProductData } from '../../shared/types';

export const directUrl = (token: string, productId: string) => `${env.publicUrl}/go/${token}/${encodeURIComponent(productId)}`;
export const cleanInstagram = (v: string | null | undefined) =>
  (v ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
export const validInstagram = (u: string) => /^[a-z0-9._]{1,30}$/.test(u);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();

async function resolveToken(token: string): Promise<{ feedId: string; projectId: string } | null> {
  const [d] = await sql<{ feed_id: string; project_id: string }[]>`
    select d.feed_id, f.project_id from designs d join feeds f on f.id = d.feed_id where d.public_token = ${token} limit 1`;
  if (d) return { feedId: d.feed_id, projectId: d.project_id };
  const [f] = await sql<{ id: string; project_id: string }[]>`select id, project_id from feeds where catalog_token = ${token} limit 1`;
  return f ? { feedId: f.id, projectId: f.project_id } : null;
}

function price(d: ProductData) {
  const sale = one(d['sale_price']);
  const p = sale || one(d['price']);
  const m = p.match(/^([\d.,\s]+)\s*([A-Z]{3})?$/);
  if (!m) return p;
  const n = Number(m[1].replace(/[\s,]/g, ''));
  const cur = m[2] === 'UAH' || !m[2] ? 'грн' : m[2];
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString('uk-UA')} ${cur}` : p;
}

export async function goRoutes(app: FastifyInstance) {
  app.get('/go/:token/:pid', async (req, reply) => {
    const { token, pid } = req.params as { token: string; pid: string };
    reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex');
    const t = /^[A-Za-z0-9_-]{8,64}$/.test(token) ? await resolveToken(token) : null;
    if (!t) return reply.status(404).type('text/html; charset=utf-8').send('<p>Посилання недійсне</p>');
    const [p] = await db.select({ instagram: schema.projects.instagram, name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.id, t.projectId));
    const ig = cleanInstagram(p?.instagram);
    const [prod] = await sql<{ data: ProductData }[]>`select data from products where feed_id = ${t.feedId} and external_id = ${pid.slice(0, 200)} limit 1`;
    if (prod) {
      sql`insert into link_clicks (feed_id, external_id, day, n) values (${t.feedId}, ${pid.slice(0, 200)}, current_date, 1)
          on conflict (feed_id, external_id, day) do update set n = link_clicks.n + 1`.catch(() => {});
    }
    if (!ig || !validInstagram(ig)) {
      const site = prod ? one(prod.data['link']) : '';
      if (/^https?:\/\//.test(site)) return reply.redirect(site, 302);
      return reply.status(404).type('text/html; charset=utf-8').send('<p>Профіль Instagram не вказано</p>');
    }
    const dm = `https://ig.me/m/${ig}`;
    const title = prod ? one(prod.data['title']) : '';
    const img = prod ? one(prod.data['image_link']) : '';
    const pr = prod ? price(prod.data) : '';
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title || 'Написати в Direct')}</title>
<meta http-equiv="refresh" content="1;url=${esc(dm)}">
<style>
:root{color-scheme:light}body{margin:0;font:16px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#faf9f7;color:#16161a;display:flex;min-height:100vh;align-items:center;justify-content:center}
.c{max-width:360px;width:100%;padding:24px;text-align:center}
img{width:160px;height:200px;object-fit:cover;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.12)}
h1{font-size:18px;margin:18px 0 4px;font-weight:600}.p{color:#6b6b76;margin:0 0 22px}
a.b{display:block;background:linear-gradient(90deg,#f58529,#dd2a7b,#8134af);color:#fff;text-decoration:none;font-weight:600;padding:14px 18px;border-radius:14px}
.s{font-size:13px;color:#8a8a94;margin-top:14px}
</style></head><body><div class="c">
${img ? `<img src="${esc(img)}" alt="">` : ''}
${title ? `<h1>${esc(title)}</h1><p class="p">${esc(pr)}</p>` : '<h1>Напишіть нам у Direct</h1>'}
<a class="b" href="${esc(dm)}">Написати в Direct @${esc(ig)}</a>
<div class="s">Відкриваємо чат… Напишіть назву товару, і ми відповімо.</div>
</div><script>setTimeout(function(){location.replace(${JSON.stringify(dm)})},350)</script></body></html>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
