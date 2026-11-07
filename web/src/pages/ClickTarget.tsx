// "Where do clicks lead": shop website or Instagram Direct — via Feedarte's instant /go page (click count per product,
// Meta pixel event for optimisation) or a plain ig.me link. Project-level: Instagram profile, prefilled message, pixel.
import { useEffect, useState } from 'react';
import { Globe, MessageCircle, Loader2, Zap, Link2, Check, CircleHelp } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../ui';

const DEFAULT_MESSAGE = 'Вітаю! Мене цікавить {title}, {price} (код {id})';
const EVENTS: [string, string][] = [
  ['Contact', 'Contact — стандартна «Контакт» (рекомендовано)'],
  ['Lead', 'Lead — «Лід»'],
  ['ViewContent', 'ViewContent — «Перегляд вмісту»'],
  ['custom', 'Власна назва події…'],
];

type Direct = { message: string; pixelId: string; capiToken: string; eventName: string };

export function ClickTarget({
  value,
  onChange,
  mode,
  onMode,
  project,
  feedId,
  onProjectSaved,
}: {
  value: 'site' | 'direct';
  onChange: (v: 'site' | 'direct') => void;
  mode: 'bridge' | 'link';
  onMode: (v: 'bridge' | 'link') => void;
  project: { id: string; instagram: string | null; direct?: Direct };
  feedId: string;
  onProjectSaved?: () => void;
}) {
  const toast = useToast();
  const [ig, setIg] = useState(project.instagram ?? '');
  const initial: Direct = { message: '', pixelId: '', capiToken: '', eventName: '', ...(project.direct ?? {}) };
  const [d, setD] = useState<Direct>(initial);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ d7: number; d30: number; top: { id: string; title: string | null; n: number }[] } | null>(null);
  useEffect(() => setIg(project.instagram ?? ''), [project.instagram]);
  useEffect(() => setD({ message: '', pixelId: '', capiToken: '', eventName: '', ...(project.direct ?? {}) }), [JSON.stringify(project.direct)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (value === 'direct') api.get(`/api/feeds/${feedId}/clicks`).then(setStats).catch(() => {});
  }, [value, feedId]);
  const custom = !!d.eventName && !EVENTS.some(([v]) => v === d.eventName);
  const projectDirty = ig.replace(/^@/, '').toLowerCase() !== (project.instagram ?? '') || JSON.stringify(d) !== JSON.stringify(initial);

  const saveProject = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/projects/${project.id}`, { instagram: ig.trim() || null, direct: { message: d.message, pixelId: d.pixelId || null, capiToken: d.capiToken || null, eventName: d.eventName || 'Contact' } });
      toast('Налаштування Direct збережено для всього проєкту');
      onProjectSaved?.();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const preview = (d.message.trim() || DEFAULT_MESSAGE).replace('{title}', 'Жакет шоколад').replace('{price}', '2 790 грн').replace('{id}', '48966771540219').replace('{brand}', 'Gloray').replace('{link}', 'https://…');

  return (
    <div data-testid="click-target">
      <div className="label">Куди веде клік по товару</div>
      <div className="seg">
        <button data-testid="ct-site" data-on={value !== 'direct'} onClick={() => onChange('site')}>
          <Globe className="w-4 h-4 mr-1.5" /> Сайт магазину
        </button>
        <button data-testid="ct-direct" data-on={value === 'direct'} onClick={() => onChange('direct')}>
          <MessageCircle className="w-4 h-4 mr-1.5" /> Instagram Direct
        </button>
      </div>

      {value === 'direct' && (
        <div className="mt-3 space-y-4">
          {/* mode */}
          <div className="grid sm:grid-cols-2 gap-2">
            {(
              [
                ['bridge', Zap, 'Через миттєву сторінку Feedarte', 'Рахує кліки по товарах і передає подію в піксель, тож кампанію можна оптимізувати. Людина сторінки не бачить: одразу відкривається Direct.'],
                ['link', Link2, 'Пряме посилання ig.me', 'У фіді одразу посилання на чат. Без проміжних кроків, але без статистики кліків і без події пікселя.'],
              ] as const
            ).map(([m, Icon, t, s]) => (
              <button key={m} data-testid={`ct-mode-${m}`} onClick={() => onMode(m)} className={`text-left rounded-2xl border p-3 transition ${mode === m ? 'border-brand-400 ring-4 ring-brand-100 bg-brand-50/40' : 'border-ink-200 hover:border-ink-300'}`}>
                <div className="flex items-center gap-2 font-medium text-[13px] text-ink-900">
                  <Icon className="w-4 h-4 text-brand-500" /> {t}
                </div>
                <div className="text-[12px] text-ink-500 mt-1 leading-snug">{s}</div>
              </button>
            ))}
          </div>

          {/* project-level settings */}
          <div className="rounded-2xl border border-ink-200 p-4 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Для всього проєкту</div>
            <div>
              <label className="label">Профіль Instagram магазину</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-sm">@</span>
                <input data-testid="ct-instagram" className="input pl-7" placeholder="gloray.ua" value={ig.replace(/^@/, '')} onChange={(e) => setIg(e.target.value)} />
              </div>
              {!ig && <div className="text-[12px] text-amber-600 mt-1">Без профілю посилання вестимуть на сайт.</div>}
            </div>
            <div>
              <label className="label">Готове повідомлення в Direct</label>
              <textarea data-testid="ct-message" className="input min-h-[64px] py-2 leading-snug" placeholder={DEFAULT_MESSAGE} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} />
              <div className="text-[11px] text-ink-500 mt-1">
                Змінні: <code>{'{title}'}</code> <code>{'{price}'}</code> <code>{'{id}'}</code> <code>{'{brand}'}</code>. Повідомлення підставляється в поле чату, і людині лишається натиснути «Надіслати». Код товару в тексті показує, що людина прийшла з реклами і про який товар питає.
              </div>
              <div className="mt-2 rounded-xl bg-ink-50 px-3 py-2 text-[13px] text-ink-700">
                <span className="text-[11px] text-ink-400 block mb-0.5">Як побачить людина:</span>
                {preview}
              </div>
            </div>
            {mode === 'bridge' && (
              <div className="space-y-3 pt-1">
                <div className="text-[13px] font-medium text-ink-800">Піксель Meta для оптимізації</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Pixel ID (Dataset ID)</label>
                    <input data-testid="ct-pixel" className="input font-mono" placeholder="2454155075096088" value={d.pixelId} onChange={(e) => setD({ ...d, pixelId: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  <div>
                    <label className="label">Подія при переході в Direct</label>
                    <select className="input" value={custom ? 'custom' : d.eventName || 'Contact'} onChange={(e) => setD({ ...d, eventName: e.target.value === 'custom' ? 'DirectClick' : e.target.value })}>
                      {EVENTS.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    {custom && <input className="input mt-2 font-mono" value={d.eventName} onChange={(e) => setD({ ...d, eventName: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} placeholder="DirectClick" />}
                  </div>
                </div>
                <div>
                  <label className="label">Conversions API токен (рекомендовано)</label>
                  <input data-testid="ct-capi" className="input font-mono" type="password" autoComplete="off" placeholder="EAAG…" value={d.capiToken} onFocus={(e) => d.capiToken === '••••••••' && setD({ ...d, capiToken: '' })} onChange={(e) => setD({ ...d, capiToken: e.target.value })} />
                  <div className="text-[11px] text-ink-500 mt-1 leading-snug">
                    Events Manager → ваш піксель → Settings → Conversions API → Generate access token. З токеном подія йде з нашого сервера одразу, редирект не чекає на браузер, і подія не губиться через блокувальники. Без токена подія відправляється з браузера.
                  </div>
                </div>
                {custom && (
                  <div className="text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 leading-snug">
                    Під власну подію в кампанії «Продажі» треба створити Custom Conversion в Events Manager. Стандартна Contact доступна для оптимізації одразу.
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button data-testid="ct-save" className="btn-outline btn-sm" disabled={!projectDirty || saving} onClick={saveProject}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Зберегти налаштування Direct
              </button>
              <a href="/help/direct" target="_blank" rel="noreferrer" className="text-[12px] text-ink-500 hover:text-ink-800 inline-flex items-center gap-1">
                <CircleHelp className="w-3.5 h-3.5" /> Як налаштувати кампанію
              </a>
            </div>
          </div>

          {mode === 'bridge' && stats && (
            <div className="rounded-2xl bg-ink-50 border border-ink-100 p-3 text-[12px]">
              <div className="flex gap-4 text-ink-600">
                <span>
                  Переходів у Direct за 7 днів: <b className="text-ink-900">{stats.d7}</b>
                </span>
                <span>
                  за 30 днів: <b className="text-ink-900">{stats.d30}</b>
                </span>
              </div>
              {stats.top.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {stats.top.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex justify-between gap-3 text-ink-600">
                      <span className="truncate">{t.title ?? t.id}</span>
                      <b className="text-ink-900 tabular-nums">{t.n}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
