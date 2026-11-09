// "Meta-каталог": any number of designs (any formats) in one feed link. Each design owns a fixed Image number;
// Meta image templates (Commerce Manager) pick numbers per placement tab, and the template is chosen per ad.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, LayoutGrid, Smartphone, Square, RectangleVertical, RectangleHorizontal, CircleHelp, Check, Loader2, AlertTriangle, ChevronDown, Wand2 } from 'lucide-react';
import { api, timeAgo } from '../api';
import { CopyField, Section, useToast } from '../ui';
import { ClickTarget } from './ClickTarget';

type Item = { no: number; designId: string | null; name?: string };
type LegacySet = { slot: number; name: string; feedDesignId: string | null; storyDesignId: string | null };
type Catalog = {
  enabled: boolean;
  items?: Item[];
  storyDefault?: string | null;
  sets?: LegacySet[];
  variants: 'all' | 'one_per_group';
  clickTarget?: 'site' | 'direct';
  directMode?: 'bridge' | 'link';
  lastBuild?: { at: string; items: number; error?: string | null; missing?: string[] } | null;
};
type State = { enabled: boolean; items: Item[]; storyDefault: string | null; variants: 'all' | 'one_per_group'; clickTarget: 'site' | 'direct'; directMode: 'bridge' | 'link' };

const MAX_NUMBER = 19;
const FORMAT_LABEL: Record<string, string> = { square: '1:1', portrait: '4:5', story: '9:16', landscape: '1.91:1' };
const FORMAT_ICON: Record<string, any> = { square: Square, portrait: RectangleVertical, story: Smartphone, landscape: RectangleHorizontal };

function itemsOf(c: Catalog | null | undefined): Item[] {
  if (!c) return [];
  if (c.items) return c.items;
  const out: Item[] = [];
  for (const s of c.sets ?? []) {
    if (s.feedDesignId) out.push({ no: 2 * (s.slot - 1), designId: s.feedDesignId });
    if (s.storyDesignId) out.push({ no: 2 * (s.slot - 1) + 1, designId: s.storyDesignId });
  }
  return out.sort((a, b) => a.no - b.no);
}
function stateOf(c: Catalog | null | undefined): State {
  return {
    enabled: !!c?.enabled,
    items: itemsOf(c),
    storyDefault: c?.items ? c.storyDefault ?? null : [...(c?.sets ?? [])].sort((a, b) => a.slot - b.slot)[0]?.storyDesignId ?? null,
    variants: c?.variants ?? 'all',
    clickTarget: c?.clickTarget ?? 'site',
    directMode: c?.directMode ?? 'bridge',
  };
}

/** where a design is used in the feed's Meta catalog (badge on design cards) */
export function catalogUsage(feed: any, designId: string): string | null {
  const c: Catalog | null = feed?.metaCatalog;
  if (!c?.enabled) return null;
  const it = itemsOf(c).find((i) => i.designId === designId);
  return it ? `Meta-каталог · Image number ${it.no}` : null;
}

function NumBadge({ n, big }: { n: number; big?: boolean }) {
  return <span data-testid="image-number" className={`${big ? 'min-w-[44px] h-11 text-[20px] rounded-xl' : 'min-w-[30px] h-7 text-[14px] rounded-lg'} px-2 bg-ink-900 text-white font-semibold flex items-center justify-center tabular-nums shrink-0`}>{n}</span>;
}

export function MetaCatalogTab({ feed, project, designs, onSaved }: { feed: any; project: any; designs: any[]; onSaved: () => void }) {
  const toast = useToast();
  const saved = useMemo(() => stateOf(feed.metaCatalog), [JSON.stringify(feed.metaCatalog ? { ...feed.metaCatalog, lastBuild: null } : null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [c, setC] = useState<State>(saved);
  const [busy, setBusy] = useState(false);
  const [howto, setHowto] = useState(!feed.metaCatalog?.enabled);
  const [pair, setPair] = useState<{ feed: string; story: string }>({ feed: '', story: '' });
  useEffect(() => setC(saved), [saved]);
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);

  const byId = (id: string | null) => designs.find((d) => d.id === id);
  const nextFree = (items: Item[]) => {
    const used = new Set(items.map((i) => i.no));
    let n = 0;
    while (used.has(n)) n++;
    return n;
  };

  // first enable: put every published design in, 4:5/1:1 first so №0 is a feed picture; first 9:16 = stories default
  const enable = () => {
    if (c.items.length) return setC({ ...c, enabled: true });
    const order = ['portrait', 'square', 'story', 'landscape'];
    const ds = [...designs].filter((d) => d.isPublished).sort((a, b) => order.indexOf(a.formatId) - order.indexOf(b.formatId));
    const items = ds.slice(0, MAX_NUMBER + 1).map((d, i) => ({ no: i, designId: d.id }));
    setC({ ...c, enabled: true, items, storyDefault: ds.find((d) => d.formatId === 'story')?.id ?? null });
  };

  const save = async (next = c) => {
    setBusy(true);
    try {
      await api.put(`/api/feeds/${feed.id}/meta-catalog`, next);
      toast(next.enabled ? 'Збережено, каталог оновлюється' : 'Meta-каталог вимкнено');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setItem = (no: number, patch: Partial<Item>) => setC({ ...c, items: c.items.map((i) => (i.no === no ? { ...i, ...patch } : i)) });
  const lb: Catalog['lastBuild'] = feed.metaCatalog?.lastBuild;
  const rendering = c.items.some((i) => i.designId && ['queued', 'rendering'].includes(byId(i.designId)?.renderStatus));
  const inCatalog = c.items.filter((i) => i.designId && byId(i.designId));
  const used = new Set(c.items.map((i) => i.designId));
  const noOf = (id: string) => c.items.find((i) => i.designId === id)?.no;

  return (
    <div className="space-y-5 max-w-5xl" data-testid="meta-catalog">
      {/* intro */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-brand-500" /> Meta-каталог: усі дизайни в одному посиланні
            </h2>
            <p className="text-[14px] text-ink-600 mt-2 leading-relaxed">
              {c.enabled ? 'Одне посилання на всі дизайни фіду. Дизайн для оголошення обирається шаблоном Meta за номером картинки.' : <>Один каталог у Commerce Manager замість окремого на кожен дизайн. Товари мають справжні ID, тому піксель працює з одним каталогом. Кожен дизайн будь-якого формату отримує свій <b>номер картинки</b>. В оголошенні шаблон Meta обирає, який номер показувати в стрічці, а який у сторіз, і їх можна комбінувати як завгодно.</>}
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
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface shadow transition-all ${c.enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        <div className="mt-4">
          <button data-testid="cat-howto" className="text-[13px] font-medium text-brand-600 flex items-center gap-1" onClick={() => setHowto((v) => !v)}>
            <ChevronDown className={`w-4 h-4 transition ${howto ? 'rotate-180' : ''}`} /> Як це працює і як налаштувати в Meta
          </button>
          {howto && (
            <div className="mt-3 rounded-2xl bg-ink-50 border border-ink-100 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-2.5">Що всередині кожного товару</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip bg-surface border border-ink-200 text-ink-700 font-mono">id: 48966771540219</span>
            <span className="text-ink-300 mx-1">→</span>
            {[
              ['0', 'Мінімал 4:5'],
              ['1', 'Мінімал 9:16'],
              ['2', 'Колаж 4:5'],
              ['3', 'Sale 4:5'],
              ['4', 'Sale 9:16'],
            ].map(([n, l]) => (
              <span key={n} className="chip bg-surface border border-ink-200 text-ink-700">
                <b className="tabular-nums mr-1">№{n}</b> {l}
              </span>
            ))}
            <span className="text-ink-400 text-sm">…</span>
          </div>
            <ol className="mt-2 space-y-1.5 text-[13px] text-ink-700 list-decimal pl-5 leading-relaxed">
              <li>Увімкніть Meta-каталог, додайте дизайни (кожен отримає номер) і натисніть «Зберегти».</li>
              <li>Скопіюйте посилання → Commerce Manager → <b>Data sources → Data feed → Scheduled feed</b>, оновлення щогодини.</li>
              <li>
                Commerce Manager → <b>Image templates → Create</b>. Шар Product на всю площу, «Crop to fit» вимкнено. На вкладках <b>1:1 / 4:5 / 9:16</b> вкажіть <b>Image number</b> потрібних дизайнів. Підібрати пару допоможе блок «Підказка для шаблону» нижче.
              </li>
              <li>
                В оголошенні: <b>Image template → Choose template</b>. Без шаблону Meta бере <b>№0</b>, а з <b>Image touch-ups</b> (формат Single image) у сторіз ставить дизайн, позначений «Сторіз без шаблону».
              </li>
            </ol>
            </div>
          )}
          <Link to="/help/meta-catalog" className="mt-2 inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-800">
            <CircleHelp className="w-3.5 h-3.5" /> Детально з прикладами в базі знань
          </Link>
        </div>
      </div>

      {c.enabled && (
        <>
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
                {!!lb?.missing?.length && <span className="text-amber-600">Ще не готові: {lb.missing.map((m: string) => byId(m)?.name ?? 'дизайн').join(', ')}</span>}
              </div>
            </div>
          )}

          {/* designs with numbers */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold">Дизайни в каталозі</div>
                <div className="text-[12px] text-ink-500">Номер закріплений за дизайном і не змінюється, коли додаєте чи прибираєте інші.</div>
              </div>
            </div>
            <div className="space-y-2">
              {c.items.map((it) => {
                const d = byId(it.designId);
                const Icon = FORMAT_ICON[d?.formatId] ?? Square;
                return (
                  <div key={it.no} data-testid="cat-item" className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-ink-50/50 px-3 py-2.5">
                    <NumBadge n={it.no} big />
                    <div className="w-10 h-12 rounded-lg bg-surface border border-ink-100 shrink-0 overflow-hidden flex items-center justify-center">
                      {d?.thumbnail ? <img src={d.thumbnail} alt="" className="max-w-full max-h-full" /> : <Icon className="w-4 h-4 text-ink-300" />}
                    </div>
                    <select data-testid="cat-design" className="input h-10 flex-1 min-w-[200px]" value={it.designId ?? ''} onChange={(e) => setItem(it.no, { designId: e.target.value || null })}>
                      <option value="">— вибрати дизайн —</option>
                      {designs.map((x) => (
                        <option key={x.id} value={x.id} disabled={used.has(x.id) && x.id !== it.designId}>
                          {x.name} · {FORMAT_LABEL[x.formatId] ?? x.formatId}
                          {x.isPublished ? '' : ' (не опубліковано)'}
                        </option>
                      ))}
                    </select>
                    {d && <span className="chip bg-surface border border-ink-200 text-ink-600"><Icon className="w-3.5 h-3.5 mr-1" />{FORMAT_LABEL[d.formatId]}</span>}
                    {it.no === 0 && <span className="chip bg-emerald-50 text-emerald-700" title="Головне фото товару: його Meta показує без шаблону">Головне фото</span>}
                    {d?.formatId === 'story' && (
                      <label className="flex items-center gap-1.5 text-[12px] text-ink-600 cursor-pointer" title="Цей 9:16 Meta сама підставить у Stories/Reels без шаблону (Image touch-ups, формат Single image)">
                        <input type="radio" name="story-default" checked={c.storyDefault === d.id} onChange={() => setC({ ...c, storyDefault: d.id })} />
                        Сторіз без шаблону
                      </label>
                    )}
                    {d && !d.isPublished && <span className="text-[11px] text-amber-600">опублікуйте дизайн</span>}
                    <button className="btn-outline btn-sm px-2 ml-auto" title="Прибрати з каталогу (номери інших не зміняться)" onClick={() => setC({ ...c, items: c.items.filter((x) => x.no !== it.no), storyDefault: c.storyDefault === it.designId ? null : c.storyDefault })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {c.items.length <= MAX_NUMBER && (
              <button
                data-testid="cat-add"
                className="mt-3 w-full rounded-2xl border-2 border-dashed border-ink-200 hover:border-brand-300 hover:bg-brand-50/30 py-3 text-sm font-medium text-ink-600 flex items-center justify-center gap-2 transition"
                onClick={() => {
                  const free = designs.find((d) => !used.has(d.id));
                  setC({ ...c, items: [...c.items, { no: nextFree(c.items), designId: free?.id ?? null }].sort((a, b) => a.no - b.no) });
                }}
              >
                <Plus className="w-4 h-4" /> Додати дизайн (отримає № {nextFree(c.items)})
              </button>
            )}
            {c.items.length > 0 && !c.items.some((i) => i.no === 0) && (
              <div className="mt-2 text-[12px] text-amber-600">№0 — головне фото товару. Додайте туди дизайн для стрічки, інакше Meta без шаблону покаже перший наявний.</div>
            )}
          </div>

          {/* template helper */}
          {inCatalog.length > 1 && (
            <div className="card p-1" data-testid="cat-helper">
              <Section title="Підібрати номери для шаблону Meta" summary="Оберіть дизайн для стрічки й для сторіз, і побачите, які Image number вписати">
              <div className="text-[12px] text-ink-500 flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-brand-500" /> Впишіть ці номери на вкладках шаблону в Commerce Manager → Image templates.</div>
              <div className="grid md:grid-cols-[1fr_1fr_260px] gap-3 items-start">
                <div>
                  <div className="label">У стрічці</div>
                  <select className="input h-10" value={pair.feed} onChange={(e) => setPair({ ...pair, feed: e.target.value })}>
                    <option value="">— дизайн —</option>
                    {inCatalog.map((i) => (
                      <option key={i.no} value={i.designId!}>№{i.no} · {byId(i.designId)?.name} · {FORMAT_LABEL[byId(i.designId)?.formatId]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">У сторіз і Reels</div>
                  <select className="input h-10" value={pair.story} onChange={(e) => setPair({ ...pair, story: e.target.value })}>
                    <option value="">— дизайн —</option>
                    {inCatalog.map((i) => (
                      <option key={i.no} value={i.designId!}>№{i.no} · {byId(i.designId)?.name} · {FORMAT_LABEL[byId(i.designId)?.formatId]}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-2xl bg-ink-50 border border-ink-100 p-3 space-y-2">
                  {[
                    ['Вкладка 1:1', Square, pair.feed],
                    ['Вкладка 4:5', RectangleVertical, pair.feed],
                    ['Вкладка 9:16', Smartphone, pair.story || pair.feed],
                  ].map(([label, Icon, id]: any) => (
                    <div key={label} className="flex items-center gap-2.5">
                      <Icon className="w-3.5 h-3.5 text-ink-400" />
                      <span className="text-[12px] text-ink-600 flex-1">{label}</span>
                      <span className="text-[11px] text-ink-400">Image number</span>
                      {id && noOf(id) !== undefined ? <NumBadge n={noOf(id)!} /> : <span className="min-w-[30px] h-7 rounded-lg bg-ink-100" />}
                    </div>
                  ))}
                </div>
              </div>
              </Section>
            </div>
          )}

          <div className="card p-5 space-y-5">
            <ClickTarget value={c.clickTarget} onChange={(v) => setC({ ...c, clickTarget: v })} mode={c.directMode} onMode={(v) => setC({ ...c, directMode: v })} project={project} feedId={feed.id} onProjectSaved={onSaved} />
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
