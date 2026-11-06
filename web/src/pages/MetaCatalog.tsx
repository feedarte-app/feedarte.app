// "Meta-каталог": several designs in one feed link; each design set gets fixed image numbers that are
// picked in Meta image templates (Commerce Manager) per ad.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, LayoutGrid, Smartphone, Square, RectangleVertical, CircleHelp, Check, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import { api, timeAgo } from '../api';
import { CopyField, useToast } from '../ui';
import { ClickTarget } from './ClickTarget';

type CatSet = { slot: number; name: string; feedDesignId: string | null; storyDesignId: string | null };
type Catalog = { enabled: boolean; sets: CatSet[]; variants: 'all' | 'one_per_group'; clickTarget?: 'site' | 'direct'; lastBuild?: { at: string; items: number; error?: string | null; missing?: string[] } | null };

const MAX_SETS = 9;
export const feedNo = (slot: number) => 2 * (slot - 1);
export const storyNo = (slot: number) => 2 * (slot - 1) + 1;

/** where a design is used in the feed's Meta catalog (for badges on design cards) */
export function catalogUsage(feed: any, designId: string): string | null {
  const c: Catalog | null = feed?.metaCatalog;
  if (!c?.enabled) return null;
  for (const s of c.sets) {
    if (s.feedDesignId === designId) return `Meta-каталог · набір ${s.slot} · стрічка (№ ${feedNo(s.slot)})`;
    if (s.storyDesignId === designId) return `Meta-каталог · набір ${s.slot} · сторіз (№ ${storyNo(s.slot)})`;
  }
  return null;
}

function DesignSelect({ value, onChange, designs, kind }: { value: string | null; onChange: (v: string | null) => void; designs: any[]; kind: 'feed' | 'story' }) {
  const list = designs.filter((d) => (kind === 'story' ? d.formatId === 'story' : d.formatId === 'portrait' || d.formatId === 'square'));
  const cur = designs.find((d) => d.id === value);
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-12 h-14 rounded-lg bg-ink-100 shrink-0 overflow-hidden flex items-center justify-center">
        {cur?.thumbnail ? <img src={cur.thumbnail} alt="" className="max-w-full max-h-full" /> : kind === 'story' ? <Smartphone className="w-4 h-4 text-ink-300" /> : <RectangleVertical className="w-4 h-4 text-ink-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <select data-testid={`cat-${kind}`} className="input h-10" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{kind === 'story' ? '— без сторіз-версії —' : '— не вибрано —'}</option>
          {list.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.isPublished ? '' : ' (не опубліковано)'}
            </option>
          ))}
        </select>
        {!list.length && <div className="text-[11px] text-ink-400 mt-1">{kind === 'story' ? 'Немає дизайнів 9:16 у цьому фіді' : 'Немає дизайнів 1:1 або 4:5 у цьому фіді'}</div>}
        {cur && !cur.isPublished && <div className="text-[11px] text-amber-600 mt-1">Опублікуйте дизайн, щоб він потрапив у каталог</div>}
      </div>
    </div>
  );
}

function Num({ n, label, icon: Icon, muted }: { n: number; label: string; icon: any; muted?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${muted ? 'opacity-50' : ''}`}>
      <Icon className="w-3.5 h-3.5 text-ink-400 shrink-0" />
      <span className="text-[12px] text-ink-600 flex-1">{label}</span>
      <span className="text-[11px] text-ink-400">Image number</span>
      <span data-testid="image-number" className="min-w-[30px] h-7 px-2 rounded-lg bg-ink-900 text-white text-[14px] font-semibold flex items-center justify-center tabular-nums">{n}</span>
    </div>
  );
}

export function MetaCatalogTab({ feed, project, designs, onSaved }: { feed: any; project: any; designs: any[]; onSaved: () => void }) {
  const toast = useToast();
  const initial: Catalog = feed.metaCatalog ?? { enabled: false, sets: [{ slot: 1, name: '', feedDesignId: null, storyDesignId: null }], variants: 'all' };
  const [c, setC] = useState<Catalog>(initial);
  const [busy, setBusy] = useState(false);
  const [howto, setHowto] = useState(!feed.metaCatalog?.enabled);
  // re-sync from the server only when the saved settings really change (polling returns fresh objects)
  const serverKey = JSON.stringify(feed.metaCatalog ? { e: feed.metaCatalog.enabled, s: feed.metaCatalog.sets, v: feed.metaCatalog.variants, t: feed.metaCatalog.clickTarget } : null);
  useEffect(() => setC(feed.metaCatalog ?? initial), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => {
    const strip = (x: Catalog | null) => x && JSON.stringify({ enabled: x.enabled, sets: x.sets, variants: x.variants, t: x.clickTarget ?? 'site' });
    return strip(c) !== strip(feed.metaCatalog ?? initial);
  }, [c, serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // sensible defaults on first enable: the first 4:5/1:1 and the first 9:16 design
  const enable = () => {
    const sets = c.sets.map((s, i) =>
      i === 0 && !s.feedDesignId && !s.storyDesignId
        ? { ...s, feedDesignId: designs.find((d) => d.formatId === 'portrait')?.id ?? designs.find((d) => d.formatId === 'square')?.id ?? null, storyDesignId: designs.find((d) => d.formatId === 'story')?.id ?? null }
        : s,
    );
    setC({ ...c, enabled: true, sets });
  };

  const save = async (next = c) => {
    setBusy(true);
    try {
      await api.put(`/api/feeds/${feed.id}/meta-catalog`, next);
      toast(next.enabled ? 'Збережено — каталог оновлюється' : 'Meta-каталог вимкнено');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setSet = (slot: number, patch: Partial<CatSet>) => setC({ ...c, sets: c.sets.map((s) => (s.slot === slot ? { ...s, ...patch } : s)) });
  const addSet = () => {
    const used = new Set(c.sets.map((s) => s.slot));
    let slot = 1;
    while (used.has(slot)) slot++;
    setC({ ...c, sets: [...c.sets, { slot, name: '', feedDesignId: null, storyDesignId: null }].sort((a, b) => a.slot - b.slot) });
  };
  const nameOf = (id: string | null) => designs.find((d) => d.id === id)?.name;
  const lb: Catalog['lastBuild'] = feed.metaCatalog?.lastBuild;
  const rendering = c.sets.some((s) => [s.feedDesignId, s.storyDesignId].some((id) => id && ['queued', 'rendering'].includes(designs.find((d) => d.id === id)?.renderStatus)));

  return (
    <div className="space-y-5 max-w-5xl" data-testid="meta-catalog">
      {/* intro */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-brand-500" /> Meta-каталог: кілька дизайнів в одному посиланні
            </h2>
            <p className="text-[14px] text-ink-600 mt-2 leading-relaxed">
              Один каталог у Commerce Manager замість окремого на кожен дизайн. Товари мають свої справжні ID, тому піксель і оптимізація працюють з одним каталогом. Кожен дизайн отримує свій <b>номер картинки</b>, а в оголошенні ви вибираєте, який показувати, через шаблон Meta.
            </p>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <span className="text-sm font-medium text-ink-700">{c.enabled ? 'Увімкнено' : 'Вимкнено'}</span>
            <button
              data-testid="cat-toggle"
              role="switch"
              aria-checked={c.enabled}
              className={`w-11 h-6 rounded-full relative transition ${c.enabled ? 'bg-brand-500' : 'bg-ink-200'}`}
              onClick={() => (c.enabled ? save({ ...c, enabled: false }) : enable())}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${c.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        {/* how it maps */}
        <div className="mt-5 rounded-2xl bg-ink-50 border border-ink-100 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-2.5">Що всередині кожного товару</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-white border border-ink-200 text-ink-700 font-mono">id: 48966771540219</span>
            <span className="text-ink-300">→</span>
            {[1, 2].map((slot) => (
              <div key={slot} className="flex items-center gap-1 rounded-xl bg-white border border-ink-200 px-1.5 py-1">
                <span className="text-[10px] font-semibold text-ink-400 px-1">Набір {slot}</span>
                <span className="chip bg-ink-900 text-white tabular-nums">№{feedNo(slot)} стрічка</span>
                <span className="chip bg-brand-500 text-white tabular-nums">№{storyNo(slot)} сторіз</span>
              </div>
            ))}
            <span className="text-ink-400 text-sm">…</span>
          </div>
          <button className="mt-3 text-[13px] font-medium text-brand-600 flex items-center gap-1" onClick={() => setHowto((v) => !v)}>
            <ChevronDown className={`w-4 h-4 transition ${howto ? 'rotate-180' : ''}`} /> Як налаштувати в Meta (5 кроків)
          </button>
          {howto && (
            <ol className="mt-2 space-y-1.5 text-[13px] text-ink-700 list-decimal pl-5 leading-relaxed">
              <li>Увімкніть Meta-каталог, розкладіть дизайни по наборах і натисніть «Зберегти».</li>
              <li>Скопіюйте посилання → Commerce Manager → <b>Data sources → Data feed → Scheduled feed</b>, оновлення щогодини.</li>
              <li>
                <b>Набір 1</b> працює без додаткових налаштувань: увімкніть в оголошенні (формат <b>Single image</b>) <b>Advantage+ creative → Image touch-ups</b>, і Meta сама візьме 4:5 у стрічку, а 9:16 у сторіз.
              </li>
              <li>
                Для інших наборів: Commerce Manager → <b>Image templates → Create</b>. Шар Product на всю площу, вимкніть «Crop to fit». На вкладках 1:1 і 4:5 вкажіть Image number <b>стрічки</b> набору, на вкладці 9:16 — номер <b>сторіз</b>. Номери показані праворуч на картці кожного набору.
              </li>
              <li>В оголошенні: <b>Image template → Choose template</b> → шаблон потрібного набору. Новий дизайн — це новий набір і новий шаблон, а каталог лишається той самий.</li>
            </ol>
          )}
          <Link to="/help/meta-catalog" className="mt-2 inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-800">
            <CircleHelp className="w-3.5 h-3.5" /> Детально з прикладами в базі знань
          </Link>
        </div>
      </div>

      {c.enabled && (
        <>
          {/* link + status */}
          {feed.catalogUrl && !dirty && (
            <div className="card p-5">
              <div className="text-sm font-medium mb-2">Посилання на каталог для Commerce Manager (CSV)</div>
              <CopyField value={feed.catalogUrl} />
              <div className="text-[12px] text-ink-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {rendering && (
                  <span className="flex items-center gap-1 text-brand-600">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Дизайни рендеряться, каталог оновиться автоматично
                  </span>
                )}
                {lb?.error ? (
                  <span className="text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {lb.error}
                  </span>
                ) : lb ? (
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Оновлено {timeAgo(lb.at)} · {lb.items.toLocaleString('uk-UA')} товарів
                  </span>
                ) : (
                  !rendering && <span>Каталог з'явиться після рендеру дизайнів</span>
                )}
                {!!lb?.missing?.length && <span className="text-amber-600">Ще не готові: {lb.missing.map((m: string) => nameOf(m) ?? 'дизайн').join(', ')}</span>}
              </div>
            </div>
          )}

          {/* sets */}
          <div className="space-y-3">
            {c.sets.map((s) => (
              <div key={s.slot} data-testid="cat-set" className="card p-5 grid lg:grid-cols-[1fr_300px] gap-5">
                <div className="space-y-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="chip bg-ink-900 text-white">Набір {s.slot}</span>
                    {s.slot === Math.min(...c.sets.map((x) => x.slot)) && <span className="chip bg-emerald-50 text-emerald-700">Основний — працює і без шаблону</span>}
                    <input className="input h-8 text-sm flex-1 min-w-0" placeholder="Назва для себе, напр. «Мінімал» або «Колаж»" value={s.name} onChange={(e) => setSet(s.slot, { name: e.target.value })} />
                    {c.sets.length > 1 && (
                      <button className="btn-outline btn-sm px-2" title="Прибрати набір (номери інших наборів не зміняться)" onClick={() => setC({ ...c, sets: c.sets.filter((x) => x.slot !== s.slot) })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <div className="label flex items-center gap-1.5">
                        <RectangleVertical className="w-3.5 h-3.5" /> Стрічка · 4:5 або 1:1
                      </div>
                      <DesignSelect kind="feed" value={s.feedDesignId} designs={designs} onChange={(v) => setSet(s.slot, { feedDesignId: v })} />
                    </div>
                    <div>
                      <div className="label flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5" /> Сторіз і Reels · 9:16
                      </div>
                      <DesignSelect kind="story" value={s.storyDesignId} designs={designs} onChange={(v) => setSet(s.slot, { storyDesignId: v })} />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-ink-50 border border-ink-100 p-4 space-y-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">У шаблоні Meta для цього набору</div>
                  <Num n={feedNo(s.slot)} label="Вкладка 1:1" icon={Square} />
                  <Num n={feedNo(s.slot)} label="Вкладка 4:5" icon={RectangleVertical} />
                  <Num n={s.storyDesignId ? storyNo(s.slot) : feedNo(s.slot)} label="Вкладка 9:16" icon={Smartphone} muted={!s.storyDesignId} />
                  {!s.storyDesignId && <div className="text-[11px] text-ink-500 leading-snug">Без сторіз-версії під № {storyNo(s.slot)} лежить та сама картинка стрічки.</div>}
                </div>
              </div>
            ))}
            {c.sets.length < MAX_SETS && (
              <button data-testid="cat-add" className="w-full rounded-2xl border-2 border-dashed border-ink-200 hover:border-brand-300 hover:bg-brand-50/30 py-4 text-sm font-medium text-ink-600 flex items-center justify-center gap-2 transition" onClick={addSet}>
                <Plus className="w-4 h-4" /> Додати набір дизайнів
              </button>
            )}
          </div>

          {/* options */}
          <div className="card p-5 space-y-5">
            <ClickTarget value={c.clickTarget ?? 'site'} onChange={(v) => setC({ ...c, clickTarget: v })} project={project} feedId={feed.id} onProjectSaved={onSaved} />
            <div>
            <div className="label">Розміри та інші варіанти товару</div>
            <div className="seg">
              <button data-on={c.variants === 'all'} onClick={() => setC({ ...c, variants: 'all' })}>Усі варіанти</button>
              <button data-on={c.variants === 'one_per_group'} onClick={() => setC({ ...c, variants: 'one_per_group' })}>Один на групу</button>
            </div>
            <p className="text-xs text-ink-500 mt-1.5 leading-relaxed">
              «Один на групу» лишає з кожного товару й кольору один розмір, той, що є в наявності, щоб у каруселі не було однакових карток. Для ремаркетингу краще «Усі варіанти»: піксель передає ID конкретного розміру.
            </p>
            </div>
          </div>

          {dirty && (
            <div className="sticky bottom-4 flex justify-end">
              <button data-testid="cat-save" className="btn-primary shadow-lift" disabled={busy} onClick={() => save()}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Зберегти і оновити каталог
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
