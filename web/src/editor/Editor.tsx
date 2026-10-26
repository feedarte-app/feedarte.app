import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Sparkles, X as XIcon, ArrowLeft, Undo2, Redo2, ChevronLeft, ChevronRight, Search, Info, ServerCog, Check, Loader2, CloudOff } from 'lucide-react';
import type { DesignDoc, Layer, LogoMaps, ProductData } from '../../../src/shared/types';
import { cleanup, duplicateSet, groupOf, makeGroup, membersOf, moveSet, patchGroup, selectedGroup, ungroup } from './groups';
import { uid } from '../../../src/shared/layers';
import { api } from '../api';
import { Modal, Spinner, useToast } from '../ui';
import { useDocHistory, patchLayer } from './state';
import { Stage } from './Stage';
import { LeftPanel, LeftRail, type LeftTab } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { loadFonts } from './browserRender';

type ProductRow = { id: number; externalId: string; title: string; data: ProductData };

export function EditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [meta, setMeta] = useState<any>(null);
  useEffect(() => {
    Promise.all([api.get(`/api/designs/${id}`), loadFonts()])
      .then(([r]) => setMeta(r))
      .catch(() => nav('/'));
  }, [id]);
  if (!meta)
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner className="w-6 h-6 text-ink-400" />
      </div>
    );
  return <Editor meta={meta} />;
}

function Editor({ meta }: { meta: any }) {
  const nav = useNavigate();
  const location = useLocation();
  const [importInfo, setImportInfo] = useState<{ importNotes: string[]; importStats?: any } | null>((location.state as any)?.importNotes ? (location.state as any) : null);
  const toast = useToast();
  const design = meta.design;
  const feed = meta.feed;
  const { doc, docRef, update, reset, undo, redo, breakMerge, canUndo, canRedo } = useDocHistory(design.draft as DesignDoc);
  const [sel, setSel] = useState<string[]>([]);
  const setSelectedId = useCallback((id: string | null) => setSel(id ? [id] : []), []);
  const [maps, setMaps] = useState<LogoMaps>(meta.logoMaps ?? {});
  const reloadMaps = useCallback(() => api.get(`/api/designs/${design.id}`).then((r) => setMaps(r.logoMaps ?? {})), []);
  const [tab, setTab] = useState<LeftTab>('product');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [ghost, setGhost] = useState(true);
  const [focusText, setFocusText] = useState(0);
  const [published, setPublished] = useState<DesignDoc | null>(design.published);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [publishing, setPublishing] = useState(false);
  const [serverPreview, setServerPreview] = useState(false);
  const stageWrap = useRef<HTMLDivElement>(null);
  const [wrapSize, setWrapSize] = useState({ w: 800, h: 600 });

  // products for preview navigation
  const [filter, setFilter] = useState<'all' | 'discount' | 'nodiscount'>('all');
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/api/feeds/${feed.id}/products?limit=200&filter=${filter}&q=${encodeURIComponent(q)}`).then((r) => {
        setProducts(r.products);
        setTotal(r.total);
        setIdx(0);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [feed.id, filter, q]);
  const product = products[idx]?.data ?? null;

  // fit zoom
  useEffect(() => {
    const el = stageWrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const z = zoom === 'fit' ? Math.max(0.1, Math.min((wrapSize.w - 120) / doc.width, (wrapSize.h - 160) / doc.height, 1)) : zoom;

  // autosave draft
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState('dirty');
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.put(`/api/designs/${design.id}/draft`, { doc: docRef.current });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 900);
    return () => clearTimeout(t);
  }, [doc]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saveState]);

  const selectedId = sel.length === 1 ? sel[0] : null;
  const selected = selectedId ? doc.layers.find((l) => l.id === selectedId) ?? null : null;
  const selGroup = selectedGroup(doc, sel);
  const selLayers = doc.layers.filter((l) => sel.includes(l.id));

  /** group-aware selection: first click selects the whole group, a second click picks the single layer */
  const pick = useCallback(
    (id: string | null, additive: boolean): string[] => {
      if (!id) {
        setSel([]);
        return [];
      }
      const d = docRef.current;
      const g = groupOf(d, id);
      let target = g ? membersOf(d, g.id) : [id];
      if (g && !additive && sel.length === target.length && target.every((t) => sel.includes(t))) target = [id];
      let next: string[];
      if (additive) next = target.every((t) => sel.includes(t)) ? sel.filter((x) => !target.includes(x)) : [...new Set([...sel, ...target])];
      else next = target;
      setSel(next);
      return next;
    },
    [sel],
  );

  const setLayer = useCallback((patch: Partial<Layer>, key?: string) => {
    if (!selectedId) return;
    update((d) => patchLayer(d, selectedId, patch), key);
  }, [selectedId, update]);

  const patchMany = useCallback((patches: { id: string; patch: Partial<Layer> }[], key?: string) => {
    update((d) => ({ ...d, layers: d.layers.map((l) => { const p = patches.find((x) => x.id === l.id); return p ? ({ ...l, ...p.patch } as Layer) : l; }) }), key);
  }, [update]);

  const addLayer = useCallback((l: Layer) => {
    update((d) => ({ ...d, layers: [...d.layers, l] }));
    setSel([l.id]);
  }, [update]);

  /** add several layers as a ready-made group (price block etc.) */
  const addGroup = useCallback((layers: Layer[], name: string) => {
    let gid = '';
    update((d) => {
      const r = makeGroup({ ...d, layers: [...d.layers, ...layers] }, layers.map((l) => l.id), name);
      gid = r.gid;
      return r.doc;
    });
    setSel(layers.map((l) => l.id));
    void gid;
  }, [update]);

  const duplicate = useCallback(() => {
    if (!sel.length) return;
    let ids: string[] = [];
    update((d) => {
      const r = duplicateSet(d, sel);
      ids = r.ids;
      return r.doc;
    });
    setSel(ids);
  }, [sel, update]);

  const remove = useCallback(() => {
    if (!sel.length) return;
    update((d) => cleanup({ ...d, layers: d.layers.filter((l) => !sel.includes(l.id)) }));
    setSel([]);
  }, [sel, update]);

  const order = useCallback((dir: 'up' | 'down' | 'top' | 'bottom') => {
    if (!sel.length) return;
    update((d) => moveSet(d, sel, dir));
  }, [sel, update]);

  const doGroup = useCallback(() => {
    if (sel.length < 2) return;
    update((d) => makeGroup(d, sel).doc);
  }, [sel, update]);

  const doUngroup = useCallback(() => {
    const g = selGroup ?? (selectedId ? groupOf(docRef.current, selectedId) : null);
    if (!g) return;
    update((d) => ungroup(d, g.id));
  }, [selGroup, selectedId, update]);

  const clipboardMany = useRef<string[]>([]);

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && k === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && k === 'g') {
        e.preventDefault();
        e.shiftKey ? doUngroup() : doGroup();
      } else if (mod && k === 'a') {
        e.preventDefault();
        setSel(docRef.current.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
      } else if (mod && k === 'c' && sel.length) {
        clipboardMany.current = [...sel];
      } else if (mod && k === 'v' && clipboardMany.current.length) {
        e.preventDefault();
        const src = clipboardMany.current.filter((id) => docRef.current.layers.some((l) => l.id === id));
        if (!src.length) return;
        let ids: string[] = [];
        update((d) => {
          const r = duplicateSet(d, src, 30);
          ids = r.ids;
          return r.doc;
        });
        setSel(ids);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) {
        e.preventDefault();
        remove();
      } else if (e.key === 'Escape') setSel([]);
      else if (selLayers.length && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0;
        const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
        patchMany(selLayers.filter((l) => !l.locked).map((l) => ({ id: l.id, patch: { x: l.x + dx, y: l.y + dy } })), `nudge:${sel.join(',')}`);
      } else if (e.key === '.' || e.key === '/') setIdx((i) => Math.min(products.length - 1, i + 1));
      else if (e.key === ',') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo, duplicate, remove, doGroup, doUngroup, sel, selLayers, update, patchMany, products.length]);

  const dirtyVsPublished = useMemo(() => JSON.stringify(doc) !== JSON.stringify(published), [doc, published]);

  const publish = async () => {
    setPublishing(true);
    try {
      await api.put(`/api/designs/${design.id}/draft`, { doc: docRef.current });
      await api.post(`/api/designs/${design.id}/publish`);
      setPublished(docRef.current);
      setSaveState('saved');
      toast('Опубліковано — картинки генеруються, фід оновиться автоматично');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (!published) return;
    if (!confirm('Скасувати всі неопубліковані зміни й повернутися до опублікованої версії?')) return;
    const r = await api.post(`/api/designs/${design.id}/discard`);
    reset(r.doc);
    setSelectedId(null);
  };

  return (
    <div className="h-full flex flex-col bg-canvas p-3 gap-3">
      {/* top bar */}
      <div className="island h-[68px] flex items-center pl-3 pr-3 gap-3 shrink-0 animate-fade-in">
        <button className="w-11 h-11 rounded-full border border-ink-200 flex items-center justify-center text-ink-700 hover:bg-ink-50 hover:-translate-x-0.5 transition" onClick={() => nav(`/feeds/${feed.id}`)} title="До фіду">
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>
        <div className="min-w-0">
          <div className="font-semibold text-[15px] tracking-tight truncate max-w-[260px]">{design.name}</div>
          <div className="text-[11px] text-ink-500 truncate">{meta.project.name} · {feed.name}</div>
        </div>
        <div className="flex-1 flex items-center justify-center gap-3">
          <div className="seg seg-accent w-[310px] border border-ink-200/70 bg-white">
            <button data-on={ghost} onClick={() => setGhost(true)}>Всі умови</button>
            <button data-on={!ghost} onClick={() => setGhost(false)}>Активні елементи</button>
          </div>
          <span title="«Всі умови» — показує напівпрозорими шари, які для цього товару приховані умовою. «Активні елементи» — саме так, як буде в рекламі." className="text-ink-400">
            <Info className="w-4 h-4" />
          </span>
          <div className="flex items-center gap-0.5 ml-2">
            <button className="w-9 h-9 rounded-full flex items-center justify-center text-ink-700 hover:bg-ink-100 disabled:opacity-30 transition" onClick={undo} disabled={!canUndo} title="Скасувати (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
            <button className="w-9 h-9 rounded-full flex items-center justify-center text-ink-700 hover:bg-ink-100 disabled:opacity-30 transition" onClick={redo} disabled={!canRedo} title="Повторити (Ctrl+Shift+Z)"><Redo2 className="w-4 h-4" /></button>
          </div>
          <select className="ed-input w-[92px] rounded-full font-medium" value={String(zoom)} onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}>
            <option value="fit">{Math.round(z * 100)}%</option>
            {[0.25, 0.4, 0.5, 0.75, 1].map((v) => (
              <option key={v} value={v}>{v * 100}%</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-ink-500 flex items-center gap-1 w-28 justify-end">
          {saveState === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Збереження…</>}
          {saveState === 'saved' && <><Check className="w-3.5 h-3.5 text-emerald-600" /> Чернетку збережено</>}
          {saveState === 'dirty' && <>Є зміни…</>}
          {saveState === 'error' && <span className="text-red-600 flex items-center gap-1"><CloudOff className="w-3.5 h-3.5" /> Не збережено</span>}
        </div>
        <button className="btn-outline btn-sm h-10" onClick={() => setServerPreview(true)} disabled={!products[idx]} title="Відрендерити цей товар на сервері — саме так картинка потрапить у фід">
          <ServerCog className="w-4 h-4" /> Перевірити
        </button>
        <button className="btn-outline text-ink-500" onClick={discard} disabled={!published || !dirtyVsPublished}>Скасувати</button>
        <button className="btn-primary min-w-[130px]" onClick={publish} disabled={publishing || (!!published && !dirtyVsPublished)}>
          {publishing && <Spinner />} {published && !dirtyVsPublished ? 'Опубліковано' : 'Опублікувати'}
        </button>
      </div>

      <div className="flex-1 flex min-h-0 gap-3">
        <div className="island flex overflow-hidden shrink-0 animate-fade-in">
        <LeftRail tab={tab} setTab={setTab} />
        <LeftPanel
          tab={tab}
          setTab={setTab}
          doc={doc}
          fields={feed.fields}
          product={product}
          projectId={meta.project.id}
          formatId={design.formatId}
          sel={sel}
          setSel={setSel}
          pick={pick}
          addLayer={addLayer}
          addGroup={addGroup}
          maps={maps}
          onLogosChanged={reloadMaps}
          update={update}
          applyTemplate={(d) => {
            update(() => ({ ...d, format: doc.format }));
            setSelectedId(null);
          }}
        />
        </div>
        <div className="flex-1 flex flex-col min-w-0 rounded-3xl bg-[#E9E9EC] relative overflow-hidden">
          {importInfo && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[min(640px,92%)] island shadow-lift p-4 pr-10 animate-pop-in">
              <button className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-100" onClick={() => setImportInfo(null)}>
                <XIcon className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 font-semibold text-[15px]">
                <span className="w-7 h-7 rounded-xl bg-gradient-to-b from-brand-300 to-brand-500 text-white flex items-center justify-center"><Sparkles className="w-4 h-4" /></span>
                Макет імпортовано
                {importInfo.importStats && (
                  <span className="text-xs font-normal text-ink-500">
                    · текстів {importInfo.importStats.texts} · фігур {importInfo.importStats.shapes} · зображень {importInfo.importStats.images} · прив’язано до полів {importInfo.importStats.bound}
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-1 text-[13px] text-ink-700 list-disc pl-5">
                {importInfo.importNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              <div className="mt-2 text-xs text-ink-500">Погортайте товари внизу (зі знижкою / без), щоб перевірити динамічні елементи, і натисніть «Опублікувати».</div>
            </div>
          )}
          <div ref={stageWrap} className="flex-1 overflow-auto relative bg-[radial-gradient(#d9d9de_1px,transparent_1px)] [background-size:22px_22px]" onPointerDown={() => setSelectedId(null)}>
            <div className="min-h-full min-w-full flex items-center justify-center px-14 pt-14 pb-24" style={{ width: 'max-content', height: 'max-content' }}>
              <div className="relative">
                <div className="absolute -top-6 left-0 text-[11px] font-medium text-ink-500 bg-white/80 rounded-full px-2 py-0.5">{doc.width}×{doc.height}</div>
                <Stage
                  doc={doc}
                  product={product}
                  zoom={z}
                  ghost={ghost}
                  maps={maps}
                  selectedIds={sel}
                  onPick={pick}
                  onChangeLayer={(lid, patch, key) => update((d) => patchLayer(d, lid, patch), key)}
                  onChangeLayers={patchMany}
                  onGestureEnd={breakMerge}
                  onDoubleClick={(lid) => {
                    setSel([lid]);
                    setFocusText((x) => x + 1);
                  }}
                />
              </div>
            </div>
          </div>
          {/* product navigator */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 rounded-full bg-white/90 backdrop-blur border border-ink-200/70 shadow-lift z-20">
            <select className="ed-input w-36 rounded-full" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
              <option value="all">Усі товари</option>
              <option value="discount">Зі знижкою</option>
              <option value="nodiscount">Без знижки</option>
            </select>
            <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-ink-100 disabled:opacity-30 transition" disabled={idx <= 0} onClick={() => setIdx(idx - 1)} title="Попередній (,)">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="h-9 rounded-full bg-ink-100 hover:bg-ink-200/70 px-4 flex items-center gap-2 max-w-[420px] transition" onClick={() => setSearchOpen(!searchOpen)}>
              <Search className="w-4 h-4 text-ink-400 shrink-0" />
              <span className="truncate text-sm">{products[idx]?.title ?? (products.length ? '' : 'Немає товарів')}</span>
              <span className="text-xs text-ink-400 shrink-0">{products.length ? `${idx + 1}/${total}` : ''}</span>
            </button>
            <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-ink-100 disabled:opacity-30 transition" disabled={idx >= products.length - 1} onClick={() => setIdx(idx + 1)} title="Наступний (.)">
              <ChevronRight className="w-4 h-4" />
            </button>
            {searchOpen && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 island shadow-lift w-[520px] p-2 z-40 animate-pop-in" onMouseLeave={() => setSearchOpen(false)}>
                <input autoFocus className="ed-input mb-2" placeholder="Пошук товару за назвою або ID" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                <div className="max-h-72 overflow-y-auto">
                  {products.map((p, i) => (
                    <button key={p.id} className={`w-full text-left px-3 py-2 rounded-xl text-[13px] flex gap-2 ${i === idx ? 'bg-brand-50 text-brand-700' : 'hover:bg-ink-50'}`} onClick={() => { setIdx(i); setSearchOpen(false); }}>
                      <span className="font-mono text-xs text-ink-400 w-24 shrink-0 truncate">{p.externalId}</span>
                      <span className="truncate">{p.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <RightPanel
          doc={doc}
          layer={selected}
          fields={feed.fields}
          product={product}
          focusText={focusText}
          setLayer={setLayer}
          setDoc={update}
          onDuplicate={duplicate}
          onDelete={remove}
          onOrder={order}
          selLayers={selLayers}
          group={selGroup}
          parentGroup={selectedId ? groupOf(doc, selectedId) : null}
          onGroup={doGroup}
          onUngroup={doUngroup}
          onSelectGroup={(gid) => setSel(membersOf(doc, gid))}
          setGroup={(gid, patch) => update((d) => patchGroup(d, gid, patch), `group:${gid}`)}
          moveSelection={(patches) => patchMany(patches)}
          projectId={meta.project.id}
          onLogosChanged={reloadMaps}
        />
      </div>
      {serverPreview && products[idx] && (
        <Modal open onClose={() => setServerPreview(false)} title="Серверний рендер (так картинка буде у фіді)" width="max-w-3xl">
          <ServerPreview designId={design.id} productId={products[idx].id} doc={doc} />
        </Modal>
      )}
    </div>
  );
}

function ServerPreview({ designId, productId, doc }: { designId: string; productId: number; doc: DesignDoc }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let url: string | null = null;
    (async () => {
      // make sure the latest draft is saved first
      await api.put(`/api/designs/${designId}/draft`, { doc });
      const res = await fetch(`/api/designs/${designId}/preview/${productId}?t=${Date.now()}`);
      if (!res.ok) {
        setErr('Не вдалося відрендерити');
        return;
      }
      url = URL.createObjectURL(await res.blob());
      setSrc(url);
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [designId, productId]);
  if (err) return <div className="text-red-600 text-sm">{err}</div>;
  if (!src) return <div className="flex justify-center py-16"><Spinner className="w-6 h-6 text-ink-400" /></div>;
  return (
    <div className="flex flex-col items-center gap-3">
      <img src={src} className="max-h-[70vh] border border-ink-200 rounded" alt="" />
      <a href={src} download={`preview-${productId}.jpg`} className="btn-outline btn-sm">Завантажити JPG</a>
    </div>
  );
}
