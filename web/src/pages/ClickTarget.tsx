// "Where do clicks lead": shop website or Instagram Direct (through Feedarte's /go page, which counts clicks per product).
import { useEffect, useState } from 'react';
import { Globe, MessageCircle, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../ui';

export function ClickTarget({
  value,
  onChange,
  project,
  feedId,
  onProjectSaved,
}: {
  value: 'site' | 'direct';
  onChange: (v: 'site' | 'direct') => void;
  project: { id: string; instagram: string | null };
  feedId: string;
  onProjectSaved?: () => void;
}) {
  const toast = useToast();
  const [ig, setIg] = useState(project.instagram ?? '');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ d7: number; d30: number; top: { id: string; title: string | null; n: number }[] } | null>(null);
  useEffect(() => setIg(project.instagram ?? ''), [project.instagram]);
  useEffect(() => {
    if (value === 'direct') api.get(`/api/feeds/${feedId}/clicks`).then(setStats).catch(() => {});
  }, [value, feedId]);

  const saveIg = async () => {
    const v = ig.trim();
    if ((project.instagram ?? '') === v.replace(/^@/, '').toLowerCase()) return;
    setSaving(true);
    try {
      const r = await api.patch(`/api/projects/${project.id}`, { instagram: v || null });
      setIg(r.instagram ?? '');
      toast(r.instagram ? `Профіль @${r.instagram} збережено` : 'Профіль прибрано');
      onProjectSaved?.();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

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
        <div className="mt-3 space-y-3">
          <div>
            <label className="label">Профіль Instagram магазину</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-sm">@</span>
                <input data-testid="ct-instagram" className="input pl-7" placeholder="gloray.ua" value={ig.replace(/^@/, '')} onChange={(e) => setIg(e.target.value)} onBlur={saveIg} onKeyDown={(e) => e.key === 'Enter' && saveIg()} />
              </div>
              {saving && <Loader2 className="w-4 h-4 animate-spin text-ink-400" />}
            </div>
            {!project.instagram && !ig && <div className="text-[12px] text-amber-600 mt-1">Без профілю посилання вестимуть на сайт.</div>}
          </div>
          <p className="text-[12px] text-ink-500 leading-relaxed">
            У фіді посилання товару замінюється на коротку сторінку Feedarte. Вона рахує кліки по кожному товару, показує, про який товар питає людина, і за мить відкриває чат з вашим профілем у застосунку Instagram (<span className="font-mono">ig.me/m/…</span>). Ремаркетинг за подіями сайту для таких переходів не працює, а оптимізувати кампанію можна на кліки.
          </p>
          {stats && (
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
