import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Plus, RefreshCw, Settings, Trash2, Palette, Copy, Pencil, SlidersHorizontal, Search, ImageOff, Package, History, ListTree,
} from 'lucide-react';
import { api, imgProxy, timeAgo } from '../api';
import { CopyField, Empty, Modal, Spinner, StatusBadge, useToast } from '../ui';
import { FeedForm, INTERVALS } from './Project';
import { FORMATS, type DesignDoc, type FeedField, type ProductData } from '../../../src/shared/types';
import { DesignPreview } from '../editor/Preview';
import { LayoutTemplate, PenTool, ImageUp } from 'lucide-react';
import { ConditionEditor } from '../editor/ConditionEditor';

type Tab = 'designs' | 'products' | 'history' | 'fields';

export function FeedPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('designs');
  const [edit, setEdit] = useState(false);
  const [create, setCreate] = useState(false);
  const [settingsFor, setSettingsFor] = useState<any>(null);
  const [sample, setSample] = useState<ProductData | null>(null);

  const load = useCallback(() => api.get(`/api/feeds/${id}`).then(setData).catch(() => nav('/')), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const busy = data && (['queued', 'syncing', 'new'].includes(data.feed.status) || data.designs.some((d: any) => ['queued', 'rendering'].includes(d.renderStatus)));
    if (!busy) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [data, load]);
  useEffect(() => {
    if (!data?.feed.productCount) return;
    api.get(`/api/feeds/${id}/products?filter=discount&limit=1`).then((r) => {
      if (r.products[0]) setSample(r.products[0].data);
      else api.get(`/api/feeds/${id}/products?limit=1`).then((r2) => setSample(r2.products[0]?.data ?? null));
    });
  }, [data?.feed.productCount, id]);

  if (!data) return <Spinner className="w-5 h-5 text-ink-400" />;
  const f = data.feed;
  const tabs: [Tab, string, any][] = [
    ['designs', `Дизайни · ${data.designs.length}`, Palette],
    ['products', `Товари · ${f.productCount.toLocaleString('uk-UA')}`, Package],
    ['fields', `Поля · ${f.fields.length}`, ListTree],
    ['history', 'Історія оновлень', History],
  ];

  return (
    <div>
      <Link to={`/projects/${data.project.id}`} className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 mb-3">
        <ChevronLeft className="w-4 h-4" /> {data.project.name}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] font-semibold tracking-tight">{f.name}</h1>
            <StatusBadge status={f.status} />
            {!f.enabled && <span className="chip bg-ink-100 text-ink-500">Пауза</span>}
          </div>
          <div className="text-xs text-ink-500 font-mono mt-1 truncate max-w-2xl">{f.sourceUrl}</div>
          <div className="text-[13px] text-ink-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>Формат: <b className="text-ink-700 uppercase">{f.format ?? '—'}</b></span>
            <span>Оновлено: <b className="text-ink-700">{timeAgo(f.lastSuccessAt)}</b></span>
            <span>Розклад: <b className="text-ink-700">{INTERVALS.find(([v]) => v === f.intervalMinutes)?.[1] ?? `${f.intervalMinutes} хв`}</b></span>
            <span>Наступне: <b className="text-ink-700">{f.enabled ? new Date(f.nextSyncAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : '—'}</b></span>
          </div>
          {f.lastError && <div className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{f.lastError}</div>}
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setEdit(true)}>
            <Settings className="w-4 h-4" /> Налаштування
          </button>
          <button
            className="btn-outline"
            onClick={async () => {
              await api.post(`/api/feeds/${id}/sync`);
              toast('Оновлення поставлено в чергу');
              load();
            }}
          >
            <RefreshCw className={`w-4 h-4 ${f.status === 'syncing' ? 'animate-spin' : ''}`} /> Оновити зараз
          </button>
          <button className="btn-primary" onClick={() => setCreate(true)} disabled={!f.productCount}>
            <Plus className="w-4 h-4" /> Новий дизайн
          </button>
        </div>
      </div>

      <div className="inline-flex gap-1 p-1 rounded-full bg-white border border-ink-200/70 shadow-card mb-6">
        {tabs.map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-2 px-4 h-9 rounded-full text-sm transition-all ${tab === t ? 'bg-ink-900 text-white font-medium shadow-sm' : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'designs' &&
        (data.designs.length === 0 ? (
          <Empty
            icon={<Palette className="w-5 h-5" />}
            title={f.productCount ? 'Створіть перший дизайн' : 'Чекаємо на товари з фіду…'}
            text="Оберіть формат і шаблон: квадрат для стрічки, 4:5 для Instagram, 9:16 для Stories, Reels і TikTok. Можна зробити кілька дизайнів і тестувати їх у рекламі."
            action={f.productCount ? <button className="btn-primary" onClick={() => setCreate(true)}>Новий дизайн</button> : <Spinner className="w-5 h-5 text-ink-400" />}
          />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.designs.map((d: any) => (
              <DesignCard key={d.id} d={d} sample={sample} onChange={load} onSettings={() => setSettingsFor(d)} />
            ))}
          </div>
        ))}
      {tab === 'products' && <ProductsTab feedId={id!} fields={f.fields} />}
      {tab === 'fields' && <FieldsTab fields={f.fields} />}
      {tab === 'history' && <HistoryTab runs={data.runs} />}

      <Modal open={edit} onClose={() => setEdit(false)} title="Налаштування фіду">
        <FeedForm
          initial={f}
          submitLabel="Зберегти"
          onSubmit={async (v) => {
            try {
              await api.patch(`/api/feeds/${id}`, v);
              setEdit(false);
              load();
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        />
        <div className="border-t border-ink-200 mt-5 pt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.enabled}
              onChange={async (e) => {
                await api.patch(`/api/feeds/${id}`, { enabled: e.target.checked });
                load();
              }}
            />
            Автооновлення за розкладом
          </label>
          <button
            className="btn-danger btn-sm"
            onClick={async () => {
              if (!confirm('Видалити фід, його дизайни і всі згенеровані картинки?')) return;
              await api.del(`/api/feeds/${id}`);
              nav(`/projects/${data.project.id}`);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Видалити фід
          </button>
        </div>
      </Modal>
      <CreateDesignModal open={create} onClose={() => setCreate(false)} feedId={id!} sample={sample} />
      {settingsFor && <OutputSettingsModal design={settingsFor} fields={f.fields} onClose={() => setSettingsFor(null)} onSaved={load} />}
    </div>
  );
}

function DesignCard({ d, sample, onChange, onSettings }: { d: any; sample: ProductData | null; onChange: () => void; onSettings: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const fmt = FORMATS.find((x) => x.id === d.formatId);
  const s = d.renderStats;
  const [showFails, setShowFails] = useState(false);
  return (
    <div className="island hover-lift overflow-hidden flex flex-col group">
      <div className="m-2 rounded-[20px] bg-gradient-to-b from-ink-100 to-ink-200/60 h-56 flex items-center justify-center cursor-pointer overflow-hidden" onClick={() => nav(`/designs/${d.id}`)}>
        {d.thumbnail ? (
          <img src={d.thumbnail} className="max-h-48 max-w-[85%] rounded-lg shadow-lift transition-transform duration-300 group-hover:scale-[1.04]" alt="" />
        ) : sample ? (
          <div className="opacity-90">
            <DraftThumb designId={d.id} sample={sample} />
          </div>
        ) : (
          <ImageOff className="w-6 h-6 text-ink-300" />
        )}
      </div>
      <div className="px-5 pb-5 pt-3 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold truncate">{d.name}</div>
          <label className="flex items-center gap-1.5 text-xs text-ink-500 shrink-0" title="Оновлювати й віддавати фід">
            <input
              type="checkbox"
              checked={d.active}
              onChange={async (e) => {
                await api.patch(`/api/designs/${d.id}`, { active: e.target.checked });
                onChange();
              }}
            />
            Активний
          </label>
        </div>
        <div className="text-xs text-ink-500 mt-0.5">
          {fmt?.label ?? d.formatId} · {d.isPublished ? `версія ${d.version}` : 'чернетка'}
          {d.hasUnpublished && d.isPublished && <span className="text-amber-600"> · є неопубліковані зміни</span>}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <StatusBadge status={d.renderStatus} />
          {d.renderStatus === 'rendering' && (
            <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${d.renderProgress}%` }} />
            </div>
          )}
          {s && d.renderStatus !== 'rendering' && (
            <span className="text-xs text-ink-500">
              {s.included.toLocaleString('uk-UA')} товарів · {timeAgo(s.at)}
              {s.failed > 0 && (
                <>
                  {' · '}
                  <button className="text-red-600 underline decoration-dotted hover:decoration-solid" onClick={() => setShowFails(true)}>
                    {s.failed} {s.failed === 1 ? 'помилка' : s.failed < 5 ? 'помилки' : 'помилок'}
                  </button>
                </>
              )}
            </span>
          )}
        </div>
        {d.renderError && <div className="text-xs text-red-600 mt-1">{d.renderError}</div>}
        <Modal open={showFails} onClose={() => setShowFails(false)} title={`Товари без картинки · ${s?.failed ?? 0}`} width="max-w-2xl">
          <p className="text-sm text-ink-500 mb-3">
            Для цих товарів не вдалося створити креатив — у вихідний фід вони потрапили з оригінальним фото, тож реклама не ламається.
            Сервіс автоматично спробує ще раз при наступному оновленні фіду.
          </p>
          {s?.failures?.length ? (
            <div className="divide-y divide-ink-100 max-h-[60vh] overflow-y-auto">
              {s.failures.map((f: any, i: number) => (
                <div key={i} className="py-2.5 text-sm">
                  <div className="font-medium">{f.title || '—'} <span className="font-mono text-xs text-ink-400">{f.id}</span></div>
                  <div className="text-red-600 text-xs mt-0.5">{f.reason}</div>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 break-all hover:underline">
                      {f.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm">Деталі з’являться після наступного рендеру — натисніть «Перерендерити» (кнопка ↻ на картці).</p>
          )}
        </Modal>
        {d.isPublished && (
          <div className="mt-3">
            <div className="text-xs text-ink-500 mb-1">Вихідний фід для Meta / TikTok Catalog:</div>
            <CopyField value={d.outputUrl} />
          </div>
        )}
        <div className="flex gap-1.5 mt-4 pt-4 border-t border-ink-100">
          <button className="btn-primary btn-sm flex-1" onClick={() => nav(`/designs/${d.id}`)}>
            <Pencil className="w-3.5 h-3.5" /> Редагувати
          </button>
          <button className="btn-outline btn-sm px-2" title="Налаштування вихідного фіду" onClick={onSettings}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-outline btn-sm px-2"
            title="Перерендерити"
            disabled={!d.isPublished}
            onClick={async () => {
              await api.post(`/api/designs/${d.id}/render`);
              toast('Рендер поставлено в чергу');
              onChange();
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-outline btn-sm px-2"
            title="Дублювати (для A/B-тесту)"
            onClick={async () => {
              await api.post(`/api/designs/${d.id}/duplicate`);
              toast('Копію створено');
              onChange();
            }}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-outline btn-sm px-2 text-red-600"
            title="Видалити"
            onClick={async () => {
              if (!confirm(`Видалити дизайн «${d.name}»? Вихідний фід перестане працювати.`)) return;
              await api.del(`/api/designs/${d.id}`);
              onChange();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftThumb({ designId, sample }: { designId: string; sample: ProductData }) {
  const [doc, setDoc] = useState<DesignDoc | null>(null);
  useEffect(() => {
    api.get(`/api/designs/${designId}`).then((r) => setDoc(r.design.draft));
  }, [designId]);
  if (!doc) return null;
  const w = doc.height > doc.width ? Math.round((190 * doc.width) / doc.height) : 190;
  return <DesignPreview doc={doc} product={sample} width={w} />;
}

function CreateDesignModal({ open, onClose, feedId, sample }: { open: boolean; onClose: () => void; feedId: string; sample: ProductData | null }) {
  const nav = useNavigate();
  const toast = useToast();
  const [formatId, setFormatId] = useState<string>('square');
  const [templates, setTemplates] = useState<any[]>([]);
  const [tpl, setTpl] = useState<string>('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<'template' | 'figma' | 'image'>('template');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<{ figma: boolean; ai: boolean } | null>(null);
  const pickFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!name) setName(f.name.replace(/\.[a-z]+$/i, '').slice(0, 80));
  };
  useEffect(() => {
    if (open) {
      api.get('/api/templates').then((r) => setTemplates(r.templates));
      api.get('/api/integrations').then(setIntegrations);
    }
  }, [open]);
  const list = useMemo(() => templates.filter((t) => t.formatId === formatId), [templates, formatId]);
  const fmt = FORMATS.find((f) => f.id === formatId)!;
  return (
    <Modal open={open} onClose={onClose} title="Новий дизайн" width="max-w-4xl">
      <div className="space-y-5">
        <div>
          <div className="label">Формат</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setFormatId(f.id);
                  setTpl('');
                }}
                className={`rounded-2xl border p-3 text-left flex items-center gap-3 transition-all ${formatId === f.id ? 'border-brand-400 ring-4 ring-brand-100 bg-brand-50/40' : 'border-ink-200 hover:border-ink-300'}`}
              >
                <div className="w-9 h-9 flex items-center justify-center shrink-0">
                  <div className="border-2 border-ink-700 rounded-sm" style={{ width: (f.w / Math.max(f.w, f.h)) * 30, height: (f.h / Math.max(f.w, f.h)) * 30 }} />
                </div>
                <div>
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-[11px] text-ink-500 leading-tight">{f.w}×{f.h} · {f.hint}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="seg seg-accent w-full max-w-md">
          <button data-on={source === 'template'} onClick={() => setSource('template')}><LayoutTemplate className="w-4 h-4 mr-1.5" />Шаблон</button>
          <button data-on={source === 'figma'} onClick={() => setSource('figma')}><PenTool className="w-4 h-4 mr-1.5" />З Figma</button>
          <button data-on={source === 'image'} onClick={() => setSource('image')}><ImageUp className="w-4 h-4 mr-1.5" />З картинки</button>
        </div>
        {source === 'template' && (
        <div className="animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[42vh] overflow-y-auto p-0.5">
            <button onClick={() => setTpl('')} className={`rounded-2xl border p-2 flex flex-col items-center transition-all justify-center gap-2 min-h-40 ${tpl === '' ? 'border-brand-400 ring-4 ring-brand-100 bg-brand-50/40' : 'border-ink-200 hover:border-ink-300'}`}>
              <Plus className="w-6 h-6 text-ink-400" />
              <span className="text-sm">Порожній</span>
            </button>
            {list.map((t) => {
              const w = fmt.h > fmt.w ? Math.round((180 * fmt.w) / fmt.h) : 180;
              return (
                <button key={t.id} onClick={() => { setTpl(t.id); if (!name) setName(t.name); }} className={`rounded-2xl border p-2 flex flex-col items-center transition-all gap-2 ${tpl === t.id ? 'border-brand-400 ring-4 ring-brand-100 bg-brand-50/40' : 'border-ink-200 hover:border-ink-300'}`}>
                  <div className="bg-ink-100 rounded-xl p-1 w-full flex justify-center">
                    <DesignPreview doc={t.doc} product={sample} width={w} />
                  </div>
                  <span className="text-[13px] text-center leading-tight">{t.name}</span>
                  {!t.builtin && <span className="chip bg-brand-50 text-brand-700">мій</span>}
                </button>
              );
            })}
          </div>
        </div>
        )}
        {source === 'figma' && (
          <div className="animate-fade-in space-y-3">
            {integrations && !integrations.figma && (
              <div className="rounded-2xl bg-amber-50 text-amber-800 text-sm px-4 py-3">Figma ще не підключено — адміністратор має додати токен в <b>Адмін-панель → Налаштування</b>.</div>
            )}
            <div>
              <label className="label">Посилання на фрейм у Figma</label>
              <input className="input font-mono text-xs" placeholder="https://www.figma.com/design/…?node-id=12-34" value={figmaUrl} onChange={(e) => setFigmaUrl(e.target.value)} />
            </div>
            <div className="rounded-2xl bg-ink-100 px-4 py-3 text-[13px] text-ink-700 leading-relaxed">
              <div className="font-medium mb-1">Як отримати посилання</div>
              У Figma виділіть фрейм креативу → правий клік → <b>Copy/Paste as → Copy link to selection</b>.
              <div className="font-medium mt-2 mb-1">Порада для точного результату</div>
              Ціни, знижки й назва розпізнаються автоматично. Щоб явно вказати поле, назвіть шар у Figma змінною: <code className="text-brand-700">{'{{title}}'}</code>, <code className="text-brand-700">{'{{image_link}}'}</code>, <code className="text-brand-700">{'{{brand}}'}</code>.
            </div>
          </div>
        )}
        {source === 'image' && (
          <div className="animate-fade-in space-y-3">
            {integrations && !integrations.ai && (
              <div className="rounded-2xl bg-amber-50 text-amber-800 text-sm px-4 py-3">Розпізнавання картинок ще не підключено — адміністратор має додати ключ Anthropic API в <b>Адмін-панель → Налаштування</b>.</div>
            )}
            <label
              className={`flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-8 cursor-pointer transition-all ${file ? 'border-brand-300 bg-brand-50/50' : 'border-ink-200 hover:border-brand-300 hover:bg-brand-50/30'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) pickFile(f);
              }}
            >
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
              {preview ? (
                <img src={preview} className="max-h-56 rounded-xl shadow-lift" alt="" />
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-card flex items-center justify-center text-brand-600"><ImageUp className="w-6 h-6" /></div>
                  <div className="text-sm font-medium">Перетягніть PNG / JPG макета або натисніть, щоб вибрати</div>
                  <div className="text-xs text-ink-500">Готовий креатив з одним товаром, до 15 МБ</div>
                </>
              )}
            </label>
            <p className="text-xs text-ink-500">AI знайде тексти, фото товару, ціни й бейджі знижки, прибере їх з фону й поставить на їхнє місце живі шари. Логотипи й декор залишаться у фоні.</p>
          </div>
        )}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="label">Назва дизайну</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Знижки — квадрат A" />
          </div>
          <button
            className="btn-primary min-w-[240px]"
            disabled={busy || !name.trim() || (source === 'figma' && !figmaUrl.trim()) || (source === 'image' && !file)}
            onClick={async () => {
              setBusy(true);
              try {
                let r: any;
                if (source === 'template') r = await api.post(`/api/feeds/${feedId}/designs`, { name, formatId, templateId: tpl || undefined });
                else if (source === 'figma') r = await api.post(`/api/feeds/${feedId}/designs/import/figma`, { name, formatId, url: figmaUrl.trim() });
                else {
                  const fd = new FormData();
                  fd.append('name', name);
                  fd.append('formatId', formatId);
                  fd.append('file', file!);
                  r = await api.post(`/api/feeds/${feedId}/designs/import/image`, fd);
                }
                nav(`/designs/${r.design.id}`, { state: r.notes ? { importNotes: r.notes, importStats: r.stats } : undefined });
              } catch (err) {
                toast((err as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner />}
            {busy ? (source === 'template' ? 'Створюємо…' : source === 'figma' ? 'Імпортуємо з Figma…' : 'AI розпізнає макет…') : source === 'template' ? 'Створити й відкрити редактор' : 'Імпортувати й відкрити'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OutputSettingsModal({ design, fields, onClose, onSaved }: { design: any; fields: FeedField[]; onClose: () => void; onSaved: () => void }) {
  const [o, setO] = useState({ ...design.output });
  const [name, setName] = useState(design.name);
  const toast = useToast();
  return (
    <Modal open onClose={onClose} title="Налаштування вихідного фіду" width="max-w-xl">
      <div className="space-y-5">
        <div>
          <label className="label">Назва дизайну</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="label">Для яких товарів генерувати креатив</div>
          <p className="text-xs text-ink-500 mb-2">Без умов — для всіх товарів. Наприклад, лише товари зі знижкою, лише бренд Nike або лише «in stock».</p>
          <ConditionEditor value={o.filter} onChange={(c) => setO({ ...o, filter: c })} fields={fields} actionLabels={['Включити', 'Виключити']} />
        </div>
        {o.filter && (
          <div>
            <div className="label">Товари, що не підпадають під умову</div>
            <div className="seg">
              <button data-on={o.mode === 'all'} onClick={() => setO({ ...o, mode: 'all' })}>Залишити з оригінальним фото</button>
              <button data-on={o.mode === 'only'} onClick={() => setO({ ...o, mode: 'only' })}>Не включати у фід</button>
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={o.keepOriginalAsAdditional} onChange={(e) => setO({ ...o, keepOriginalAsAdditional: e.target.checked })} />
          Додавати оригінальне фото в additional_image_link
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Формат зображень</label>
            <select className="input" value={o.imageFormat} onChange={(e) => setO({ ...o, imageFormat: e.target.value })}>
              <option value="jpg">JPG (рекомендовано)</option>
              <option value="png">PNG</option>
            </select>
          </div>
          <div>
            <label className="label">Якість JPG: {o.quality}</label>
            <input type="range" min={60} max={100} value={o.quality} onChange={(e) => setO({ ...o, quality: Number(e.target.value) })} className="w-full mt-3" />
          </div>
        </div>
        <button
          className="btn-primary w-full"
          onClick={async () => {
            try {
              await api.patch(`/api/designs/${design.id}`, { name, output: o });
              toast('Збережено — фід буде перегенеровано');
              onSaved();
              onClose();
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        >
          Зберегти
        </button>
      </div>
    </Modal>
  );
}

function ProductsTab({ feedId, fields }: { feedId: string; fields: FeedField[] }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<any>(null);
  const [open, setOpen] = useState<any>(null);
  const limit = 50;
  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/api/feeds/${feedId}/products?q=${encodeURIComponent(q)}&filter=${filter}&offset=${page * limit}&limit=${limit}`).then(setRes);
    }, 200);
    return () => clearTimeout(t);
  }, [q, filter, page, feedId]);
  const first = (v: any) => (Array.isArray(v) ? v[0] : v);
  return (
    <div className="card overflow-hidden">
      <div className="p-3 flex gap-2 border-b border-ink-200">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-ink-400" />
          <input className="input pl-9" placeholder="Пошук за назвою або ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <select className="input w-48" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
          <option value="all">Усі товари</option>
          <option value="discount">Зі знижкою</option>
          <option value="nodiscount">Без знижки</option>
        </select>
      </div>
      {!res ? (
        <div className="p-6"><Spinner /></div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-500 text-xs border-b border-ink-200">
                <th className="p-3 w-16"></th>
                <th className="p-3">ID</th>
                <th className="p-3">Назва</th>
                <th className="p-3">Ціна</th>
                <th className="p-3">Зі знижкою</th>
                <th className="p-3">Наявність</th>
              </tr>
            </thead>
            <tbody>
              {res.products.map((p: any) => (
                <tr key={p.id} className="border-b border-ink-100 hover:bg-ink-50 cursor-pointer" onClick={() => setOpen(p)}>
                  <td className="p-2 pl-3">
                    {first(p.data.image_link) ? <img src={imgProxy(first(p.data.image_link))} className="w-10 h-10 rounded object-cover bg-ink-100" loading="lazy" alt="" /> : <div className="w-10 h-10 rounded bg-ink-100" />}
                  </td>
                  <td className="p-3 font-mono text-xs">{p.externalId}</td>
                  <td className="p-3">{p.title}</td>
                  <td className="p-3 whitespace-nowrap">{first(p.data.price)}</td>
                  <td className="p-3 whitespace-nowrap text-red-600">{first(p.data.sale_price) ?? ''}</td>
                  <td className="p-3 text-xs">{first(p.data.availability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 flex items-center justify-between text-sm text-ink-500">
            <span>Знайдено: {res.total.toLocaleString('uk-UA')}</span>
            <div className="flex gap-2">
              <button className="btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</button>
              <button className="btn-outline btn-sm" disabled={(page + 1) * limit >= res.total} onClick={() => setPage(page + 1)}>Далі</button>
            </div>
          </div>
        </>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} width="max-w-2xl">
        {open && (
          <div className="space-y-1 text-sm">
            {Object.entries(open.data as ProductData).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[180px_1fr] gap-3 py-1.5 border-b border-ink-100">
                <span className="font-mono text-xs text-ink-500">{k}</span>
                <span className="break-all">{Array.isArray(v) ? v.join(' | ') : v}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
      {void fields}
    </div>
  );
}

function FieldsTab({ fields }: { fields: FeedField[] }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500 text-xs border-b border-ink-200">
            <th className="p-3">Поле</th>
            <th className="p-3">Заповнено</th>
            <th className="p-3">Приклад</th>
            <th className="p-3">Змінна</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key} className="border-b border-ink-100">
              <td className="p-3 font-mono text-xs">{f.key}</td>
              <td className="p-3">{f.count.toLocaleString('uk-UA')}</td>
              <td className="p-3 text-ink-500 truncate max-w-md">{f.sample}</td>
              <td className="p-3 font-mono text-xs text-brand-600">{`{{${f.key}}}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTab({ runs }: { runs: any[] }) {
  if (!runs.length) return <div className="text-sm text-ink-500">Ще не було оновлень.</div>;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500 text-xs border-b border-ink-200">
            <th className="p-3">Час</th>
            <th className="p-3">Статус</th>
            <th className="p-3">Товарів</th>
            <th className="p-3">Змінено</th>
            <th className="p-3">Видалено</th>
            <th className="p-3">Тривалість</th>
            <th className="p-3">Помилка</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-ink-100">
              <td className="p-3 whitespace-nowrap">{new Date(r.startedAt).toLocaleString('uk-UA')}</td>
              <td className="p-3"><StatusBadge status={r.status} /></td>
              <td className="p-3">{r.stats?.products?.toLocaleString('uk-UA') ?? '—'}</td>
              <td className="p-3">{r.stats?.changed ?? '—'}</td>
              <td className="p-3">{r.stats?.removed ?? '—'}</td>
              <td className="p-3">{r.stats ? `${(r.stats.ms / 1000).toFixed(1)} с` : '—'}</td>
              <td className="p-3 text-red-600 text-xs">{r.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
