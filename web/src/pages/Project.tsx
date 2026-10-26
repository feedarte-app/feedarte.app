import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, Rss, RefreshCw, Trash2, Pencil, Clock } from 'lucide-react';
import { api, timeAgo } from '../api';
import { Empty, Modal, Spinner, StatusBadge, useToast } from '../ui';

export const INTERVALS = [
  [15, 'Кожні 15 хв'],
  [30, 'Кожні 30 хв'],
  [60, 'Щогодини'],
  [120, 'Кожні 2 год'],
  [360, 'Кожні 6 год'],
  [720, 'Кожні 12 год'],
  [1440, 'Раз на добу'],
] as const;

export function FeedForm({ initial, onSubmit, submitLabel }: { initial?: { name: string; sourceUrl: string; intervalMinutes: number }; onSubmit: (v: { name: string; sourceUrl: string; intervalMinutes: number }) => Promise<void>; submitLabel: string }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.sourceUrl ?? '');
  const [interval, setIntervalV] = useState(initial?.intervalMinutes ?? 60);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit({ name, sourceUrl: url.trim(), intervalMinutes: interval });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label">Назва</label>
        <input className="input" placeholder="Напр. Facebook фід (UA)" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Посилання на XML-фід</label>
        <input className="input font-mono text-xs" placeholder="https://shop.com/feed.xml" value={url} onChange={(e) => setUrl(e.target.value)} />
        <p className="text-xs text-ink-500 mt-1.5">Google Merchant / Meta RSS, Atom, YML (Rozetka, Prom). Розмір — до сотень тисяч товарів.</p>
      </div>
      <div>
        <label className="label">Оновлення</label>
        <select className="input" value={interval} onChange={(e) => setIntervalV(Number(e.target.value))}>
          {INTERVALS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <button className="btn-primary w-full" disabled={busy || !name.trim() || !url.trim()}>
        {busy && <Spinner />} {submitLabel}
      </button>
    </form>
  );
}

export function ProjectPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [add, setAdd] = useState(false);
  const [rename, setRename] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(() => api.get(`/api/projects/${id}`).then(setData).catch(() => nav('/')), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!data?.feeds?.some((f: any) => ['queued', 'syncing', 'new'].includes(f.status))) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data, load]);

  if (!data) return <Spinner className="w-5 h-5 text-ink-400" />;
  return (
    <div>
      <Link to="/" className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 mb-3">
        <ChevronLeft className="w-4 h-4" /> Проєкти
      </Link>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[28px] font-semibold tracking-tight">{data.project.name}</h1>
          <button className="btn-ghost btn-sm px-2" onClick={() => { setNewName(data.project.name); setRename(true); }} title="Перейменувати">
            <Pencil className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-danger"
            onClick={async () => {
              if (!confirm('Видалити проєкт з усіма фідами, дизайнами та картинками? Вихідні фіди перестануть працювати.')) return;
              await api.del(`/api/projects/${id}`);
              nav('/');
            }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button className="btn-primary" onClick={() => setAdd(true)}>
            <Plus className="w-4 h-4" /> Додати фід
          </button>
        </div>
      </div>

      {data.feeds.length === 0 ? (
        <Empty
          icon={<Rss className="w-5 h-5" />}
          title="Додайте перший фід"
          text="Вставте посилання на XML-фід товарів. Ми завантажимо товари, визначимо поля й оновлюватимемо дані за розкладом."
          action={<button className="btn-primary" onClick={() => setAdd(true)}>Додати фід</button>}
        />
      ) : (
        <div className="space-y-3">
          {data.feeds.map((f: any) => (
            <Link key={f.id} to={`/feeds/${f.id}`} className="island hover-lift p-5 flex items-center gap-5">
              <div className="w-11 h-11 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 shadow-[inset_0_0_0_1px_rgba(255,107,26,.15)]">
                <Rss className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{f.name}</span>
                  <StatusBadge status={f.status} />
                  {f.format && <span className="chip bg-ink-100 text-ink-500 uppercase">{f.format}</span>}
                </div>
                <div className="text-xs text-ink-500 font-mono truncate mt-1">{f.sourceUrl}</div>
                {f.lastError && <div className="text-xs text-red-600 mt-1 truncate">{f.lastError}</div>}
              </div>
              <div className="hidden md:flex -space-x-2">
                {f.designs.slice(0, 4).map((d: any) =>
                  d.thumbnail ? (
                    <img key={d.id} src={d.thumbnail} className="w-11 h-11 rounded-xl border-2 border-white object-cover bg-ink-100 shadow-sm" alt="" />
                  ) : (
                    <div key={d.id} className="w-11 h-11 rounded-xl border-2 border-white bg-ink-100" />
                  ),
                )}
              </div>
              <div className="text-right text-sm shrink-0 w-40">
                <div className="font-medium">{f.productCount.toLocaleString('uk-UA')} товарів</div>
                <div className="text-xs text-ink-500 flex items-center justify-end gap-1 mt-0.5">
                  <Clock className="w-3 h-3" /> {timeAgo(f.lastSuccessAt)}
                </div>
              </div>
              <button
                className="btn-ghost btn-sm px-2"
                title="Оновити зараз"
                onClick={async (e) => {
                  e.preventDefault();
                  await api.post(`/api/feeds/${f.id}/sync`);
                  toast('Оновлення поставлено в чергу');
                  load();
                }}
              >
                <RefreshCw className={`w-4 h-4 ${f.status === 'syncing' ? 'animate-spin' : ''}`} />
              </button>
            </Link>
          ))}
        </div>
      )}

      <Modal open={add} onClose={() => setAdd(false)} title="Новий фід">
        <FeedForm
          submitLabel="Додати й завантажити"
          onSubmit={async (v) => {
            try {
              const r = await api.post(`/api/projects/${id}/feeds`, v);
              nav(`/feeds/${r.feed.id}`);
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        />
      </Modal>
      <Modal open={rename} onClose={() => setRename(false)} title="Перейменувати проєкт" width="max-w-md">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.patch(`/api/projects/${id}`, { name: newName });
            setRename(false);
            load();
          }}
        >
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <button className="btn-primary w-full">Зберегти</button>
        </form>
      </Modal>
    </div>
  );
}
