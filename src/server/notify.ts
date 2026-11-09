// Developer notifications to the main admin's Telegram (bot token + chat in admin settings).
// notify() never throws and never blocks the caller's request.
import { getSetting, setSetting } from './auth';
import { sqlClient as sql } from './db';
import { env } from './env';
import { log } from './log';

export const TG_EVENTS = {
  register: { label: 'Нова реєстрація', def: true },
  pending: { label: 'Реєстрація чекає підтвердження', def: true },
  project: { label: 'Створено проєкт', def: false },
  feed: { label: 'Підключено фід', def: true },
  publish: { label: 'Перша публікація дизайну', def: true },
  feedError: { label: 'Фід перестав завантажуватись', def: true },
  renderError: { label: 'Помилка рендеру дизайну', def: true },
  transfer: { label: 'Передача проєкту', def: true },
  access: { label: 'Тріал / оплачений доступ закінчується', def: true },
  worker: { label: 'Воркер не відповідає / черга стоїть', def: true },
} as const;
export type TgEvent = keyof typeof TG_EVENTS;

export interface TgConfig {
  token: string;
  chatId: string;
  chatTitle: string;
  events: Partial<Record<TgEvent, boolean>>;
}
export const TG_DEFAULT: TgConfig = { token: '', chatId: '', chatTitle: '', events: {} };

let cache: { at: number; cfg: TgConfig } | null = null;
export async function getTgConfig(fresh = false): Promise<TgConfig> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.cfg;
  const cfg = { ...TG_DEFAULT, ...(await getSetting<Partial<TgConfig>>('telegram', {})) };
  cache = { at: Date.now(), cfg };
  return cfg;
}
export async function setTgConfig(cfg: TgConfig) {
  await setSetting('telegram', cfg);
  cache = null;
}
export const eventOn = (cfg: TgConfig, e: TgEvent) => cfg.events[e] ?? TG_EVENTS[e].def;

export const tgEsc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const appLink = (path: string, label: string) => `<a href="${tgEsc(env.publicUrl + path)}">${tgEsc(label)}</a>`;

export async function tgApi<T = any>(token: string, method: string, body?: object): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(j.description || `Telegram HTTP ${r.status}`);
  return j.result as T;
}

export async function sendTg(cfg: TgConfig, html: string) {
  await tgApi(cfg.token, 'sendMessage', { chat_id: cfg.chatId, text: html.slice(0, 4000), parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
}

/**
 * Send a notification if the event is enabled.
 * `once` = dedupe key: the same key is sent at most once per `hours` (shared across api/worker via DB).
 */
export function notify(event: TgEvent, html: string, once?: { key: string; hours: number }) {
  void (async () => {
    try {
      const cfg = await getTgConfig();
      if (!cfg.token || !cfg.chatId || !eventOn(cfg, event)) return;
      if (once) {
        const k = `tgsent:${once.key}`;
        const rows = await sql<{ key: string }[]>`
          insert into settings (key, value) values (${k}, ${JSON.stringify({ at: new Date().toISOString() })}::jsonb)
          on conflict (key) do update set value = excluded.value
            where (settings.value->>'at')::timestamptz < now() - make_interval(hours => ${once.hours})
          returning key`;
        if (!rows.length) return; // already sent recently
      }
      const env_ = env.isProd ? '' : ' <i>(dev)</i>';
      await sendTg(cfg, `${html}${env_}`);
    } catch (e) {
      log.warn({ event, err: (e as Error).message }, 'telegram notify failed');
    }
  })();
}

/** API-side watchdog: alert when no worker heartbeat while jobs are waiting. */
export function startWatchdog() {
  const check = async () => {
    try {
      const [r] = await sql<{ alive: number; queued: number; oldest: number | null }[]>`
        select (select count(*)::int from settings where key like 'worker:%' and (value->>'at')::timestamptz > now() - interval '3 minutes') as alive,
               (select count(*)::int from jobs where status = 'queued' and run_after < now()) as queued,
               (select extract(epoch from now() - min(run_after))::int from jobs where status = 'queued' and run_after < now()) as oldest`;
      if (r.alive === 0 && r.queued > 0) notify('worker', `🔴 <b>Воркер не відповідає</b>\nУ черзі ${r.queued} задач, жоден воркер не надсилав heartbeat понад 3 хв.`, { key: 'worker-down', hours: 1 });
      else if (r.alive > 0 && (r.oldest ?? 0) > 30 * 60) notify('worker', `🟠 <b>Черга стоїть</b>\n${r.queued} задач чекають, найстаріша — ${Math.round((r.oldest ?? 0) / 60)} хв.`, { key: 'queue-stuck', hours: 2 });
    } catch {
      /* db hiccup — next tick */
    }
  };
  const accessCheck = async () => {
    try {
      const rows = await sql<{ id: string; email: string; plan: string | null; until: Date; days: number }[]>`
        select id, email, plan, access_until as until, ceil(extract(epoch from access_until - now()) / 86400)::int as days
        from users where role <> 'admin' and status = 'active' and access_until is not null
          and access_until between now() - interval '3 days' and now() + interval '2 days'`;
      for (const u of rows) {
        const what = u.plan === 'trial' ? 'Тріал' : 'Оплачений доступ';
        const date = u.until.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' });
        if (u.until.getTime() > Date.now())
          notify('access', `⏰ <b>${what} закінчується ${date}</b>\n${tgEsc(u.email)}\n${appLink('/admin', 'Продовжити в адмін-панелі')}`, { key: `access-soon:${u.id}:${u.until.toISOString()}`, hours: 24 * 7 });
        else
          notify('access', `🧊 <b>${what} закінчився — акаунт заморожено</b>\n${tgEsc(u.email)}\nФіди не оновлюються, посилання працюють з останніми картинками.\n${appLink('/admin', 'Продовжити в адмін-панелі')}`, { key: `access-over:${u.id}:${u.until.toISOString()}`, hours: 24 * 30 });
      }
    } catch {
      /* next tick */
    }
  };
  setTimeout(accessCheck, 90_000);
  setInterval(accessCheck, 30 * 60_000);
  setTimeout(check, 60_000);
  setInterval(check, 2 * 60_000);
}
