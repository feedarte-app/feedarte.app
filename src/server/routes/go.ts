// Instagram Direct links for catalog items.
//
// Two modes:
//  • "link"   — the feed holds a plain https://ig.me/m/<profile>?text=… link (Instagram opens the chat in the app).
//  • "bridge" — the feed holds /go/<token>/<product>: an instant redirect page that counts the click per product
//               and reports a Meta pixel event (server-side via Conversions API and/or browser beacon), so a Sales
//               campaign has an event to optimise for, then opens the same ig.me link.
// The prefilled message names the product and its code, so in Direct it's clear which ad/product the person came from.
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient as sql } from '../db';
import { env } from '../env';
import type { ProductData } from '../../shared/types';
import type { DirectSettings } from '../db/schema';
import { log } from '../log';

export const DEFAULT_MESSAGE = 'Вітаю! Мене цікавить {title}, {price} (код {id})';
export const DEFAULT_EVENT = 'Contact';

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

export function formatPrice(d: ProductData) {
  const p = one(d['sale_price']) || one(d['price']);
  const m = p.match(/^([\d.,\s]+)\s*([A-Z]{3})?$/);
  if (!m) return p;
  const n = Number(m[1].replace(/[\s,]/g, ''));
  const cur = m[2] === 'UAH' || !m[2] ? 'грн' : m[2];
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString('uk-UA').replace(/ /g, ' ')} ${cur}` : p;
}
const priceValue = (d: ProductData) => {
  const m = (one(d['sale_price']) || one(d['price'])).match(/^([\d.,\s]+)\s*([A-Z]{3})?$/);
  return m ? { value: Number(m[1].replace(/[\s,]/g, '')), currency: m[2] ?? 'UAH' } : null;
};

export function directMessage(template: string | undefined, d: ProductData, id: string) {
  const t = (template ?? '').trim() || DEFAULT_MESSAGE;
  return t
    .replace(/\{title\}/g, one(d['title']))
    .replace(/\{price\}/g, formatPrice(d))
    .replace(/\{id\}/g, id)
    .replace(/\{brand\}/g, one(d['brand']))
    .replace(/\{link\}/g, one(d['link']))
    .replace(/\s+,/g, ',')
    .slice(0, 900);
}

/** https://ig.me/m/<profile>?text=…&ref=… (text is not documented by Meta but works in current apps; ref reaches the Messaging API) */
export function igLink(profile: string, text: string | null, ref?: string) {
  // encodeURIComponent (spaces → %20): some apps show "+" literally
  const q: string[] = [];
  if (text) q.push(`text=${encodeURIComponent(text)}`);
  if (ref) q.push(`ref=${encodeURIComponent(ref.replace(/[^\w.-]/g, '_').slice(0, 60))}`);
  return `https://ig.me/m/${profile}${q.length ? `?${q.join('&')}` : ''}`;
}

/** link for a catalog item in Direct mode */
export function directLinkFor(mode: 'bridge' | 'link' | undefined, token: string, profile: string, settings: DirectSettings | null | undefined, d: ProductData) {
  const id = one(d['id']);
  if (mode === 'link') return igLink(profile, directMessage(settings?.message, d, id), `fa_${id}`);
  return directUrl(token, id);
}

async function resolveToken(token: string): Promise<{ feedId: string; projectId: string } | null> {
  const [d] = await sql<{ feed_id: string; project_id: string }[]>`
    select d.feed_id, f.project_id from designs d join feeds f on f.id = d.feed_id where d.public_token = ${token} limit 1`;
  if (d) return { feedId: d.feed_id, projectId: d.project_id };
  const [f] = await sql<{ id: string; project_id: string }[]>`select id, project_id from feeds where catalog_token = ${token} limit 1`;
  return f ? { feedId: f.id, projectId: f.project_id } : null;
}

/** Conversions API event (fire-and-forget) */
function sendCapi(pixelId: string, token: string, ev: { name: string; id: string; url: string; ip: string; ua: string; fbc: string | null; productId: string; title: string; price: { value: number; currency: string } | null }) {
  const body = {
    data: [
      {
        event_name: ev.name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.id,
        action_source: 'website',
        event_source_url: ev.url,
        user_data: { client_ip_address: ev.ip, client_user_agent: ev.ua, ...(ev.fbc ? { fbc: ev.fbc } : {}) },
        custom_data: { content_ids: [ev.productId], content_type: 'product', content_name: ev.title, ...(ev.price ? { value: ev.price.value, currency: ev.price.currency } : {}) },
      },
    ],
  };
  fetch(`https://graph.facebook.com/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
    .then(async (r) => {
      if (!r.ok) log.warn({ pixelId, status: r.status, body: (await r.text()).slice(0, 300) }, 'capi event rejected');
    })
    .catch((e) => log.warn({ pixelId, err: String(e) }, 'capi event failed'));
}

export async function goRoutes(app: FastifyInstance) {
  app.get('/go/:token/:pid', async (req, reply) => {
    const { token, pid } = req.params as { token: string; pid: string };
    reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex').header('referrer-policy', 'no-referrer-when-downgrade');
    const t = /^[A-Za-z0-9_-]{8,64}$/.test(token) ? await resolveToken(token) : null;
    if (!t) return reply.status(404).type('text/html; charset=utf-8').send('<p>Посилання недійсне</p>');
    const [p] = await db.select({ instagram: schema.projects.instagram, direct: schema.projects.direct }).from(schema.projects).where(eq(schema.projects.id, t.projectId));
    const ig = cleanInstagram(p?.instagram);
    const settings = p?.direct ?? {};
    const productId = pid.slice(0, 200);
    const [prod] = await sql<{ data: ProductData }[]>`select data from products where feed_id = ${t.feedId} and external_id = ${productId} limit 1`;
    if (prod) {
      sql`insert into link_clicks (feed_id, external_id, day, n) values (${t.feedId}, ${productId}, current_date, 1)
          on conflict (feed_id, external_id, day) do update set n = link_clicks.n + 1`.catch(() => {});
    }
    if (!ig || !validInstagram(ig)) {
      const site = prod ? one(prod.data['link']) : '';
      if (/^https?:\/\//.test(site)) return reply.redirect(site, 302);
      return reply.status(404).type('text/html; charset=utf-8').send('<p>Профіль Instagram не вказано</p>');
    }
    const data = prod?.data ?? ({ id: productId } as ProductData);
    const dm = igLink(ig, prod ? directMessage(settings.message, data, productId) : null, `fa_${productId}`);

    // Meta pixel event: server-side (Conversions API) when a token is set, plus a browser beacon with the same event_id
    const pixelId = (settings.pixelId ?? '').replace(/\D/g, '');
    const eventName = (settings.eventName ?? '').trim() || DEFAULT_EVENT;
    const eventId = crypto.randomUUID();
    const q = req.query as Record<string, string>;
    const fbc = q.fbclid ? `fb.1.${Date.now()}.${q.fbclid}` : null;
    const pageUrl = `${env.publicUrl}${req.url}`;
    const price = prod ? priceValue(prod.data) : null;
    if (pixelId && settings.capiToken) {
      sendCapi(pixelId, settings.capiToken, { name: eventName, id: eventId, url: pageUrl, ip: req.ip, ua: String(req.headers['user-agent'] ?? ''), fbc, productId, title: one(data['title']), price });
    }
    let beacon = '';
    if (pixelId) {
      const tr = new URLSearchParams({ id: pixelId, ev: eventName, dl: pageUrl, eid: eventId, noscript: '1' });
      tr.set('cd[content_ids]', JSON.stringify([productId]));
      tr.set('cd[content_type]', 'product');
      if (price) {
        tr.set('cd[value]', String(price.value));
        tr.set('cd[currency]', price.currency);
      }
      beacon = `https://www.facebook.com/tr?${tr.toString()}`;
    }

    // instant redirect: the script runs in <head> before anything is painted; the card only appears if the app
    // didn't take over (e.g. desktop browser)
    const title = one(data['title']);
    const img = prod ? one(prod.data['image_link']) : '';
    const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title || 'Instagram Direct')}</title>
<script>(function(){var u=${JSON.stringify(dm)},b=${JSON.stringify(beacon)};
function go(){location.replace(u)}
if(b){try{var i=new Image();i.onload=i.onerror=go;i.src=b;setTimeout(go,250);}catch(e){go()}}else go();})();</script>
<noscript><meta http-equiv="refresh" content="0;url=${esc(dm)}"></noscript>
<style>
body{margin:0;font:16px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#16161a;display:flex;min-height:100vh;align-items:center;justify-content:center}
.c{max-width:340px;width:100%;padding:24px;text-align:center;opacity:0;animation:show .2s 1.2s forwards}
@keyframes show{to{opacity:1}}
img{width:140px;height:175px;object-fit:cover;border-radius:16px}
h1{font-size:17px;margin:16px 0 4px;font-weight:600}.p{color:#6b6b76;margin:0 0 20px}
a.b{display:block;background:linear-gradient(90deg,#f58529,#dd2a7b,#8134af);color:#fff;text-decoration:none;font-weight:600;padding:14px 18px;border-radius:14px}
</style></head><body><div class="c">
${img ? `<img src="${esc(img)}" alt="">` : ''}
${title ? `<h1>${esc(title)}</h1><p class="p">${esc(prod ? formatPrice(prod.data) : '')}</p>` : ''}
<a class="b" href="${esc(dm)}">Написати в Direct @${esc(ig)}</a>
</div></body></html>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
