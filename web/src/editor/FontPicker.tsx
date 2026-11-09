import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Upload, Trash2, Check, Loader2 } from 'lucide-react';
import { FONTS, FONT_CATEGORIES, type FontDef } from '../../../src/shared/fonts';
import type { CustomFont } from '../../../src/shared/types';
import { useToast } from '../ui';

const WEIGHT_NAMES: Record<number, string> = { 100: 'Тонкий', 200: 'Дуже світлий', 300: 'Світлий', 400: 'Звичайний', 500: 'Середній', 600: 'Напівжирний', 700: 'Жирний', 800: 'Дуже жирний', 900: 'Чорний', 1000: 'Надчорний' };

/** weights available for a family, as [value, label] */
export function weightsFor(family: string, custom: CustomFont[]): [number, string][] {
  const f = FONTS.find((x) => x.family === family);
  const ok = (w: number) => {
    if (f) return w >= f.weights[0] && w <= f.weights[1];
    return custom.some((c) => c.cssFamily === family && (c.weightMax ? w >= c.weight && w <= c.weightMax : w === c.weight));
  };
  const list = Object.entries(WEIGHT_NAMES)
    .map(([w, l]) => [Number(w), `${l} (${w})`] as [number, string])
    .filter(([w]) => ok(w));
  return list.length ? list : [[400, 'Звичайний (400)']];
}

export function familyLabel(family: string, custom: CustomFont[]): string {
  if (!family.startsWith('cf_')) return family;
  return custom.find((c) => c.cssFamily === family)?.family ?? 'Завантажений шрифт';
}

const preview = (family: string) => `/api/font-preview?family=${encodeURIComponent(family)}`;

export function FontPicker({
  value,
  onChange,
  projectId,
  fonts,
  onFontsChanged,
}: {
  value: string;
  onChange: (family: string) => void;
  projectId?: string;
  fonts: CustomFont[];
  onFontsChanged?: (list: CustomFont[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0, maxH: 400 });
  const toast = useToast();

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = 320;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom - 12;
    const top = below > 360 ? r.bottom + 6 : Math.max(8, r.top - Math.min(520, r.top - 16) - 6);
    setPos({ left, top, maxH: below > 360 ? Math.min(520, below) : Math.min(520, r.top - 16) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  // one entry per uploaded family
  const families = useMemo(() => {
    const m = new Map<string, { cssFamily: string; family: string; files: CustomFont[] }>();
    for (const c of fonts) {
      const e = m.get(c.cssFamily) ?? { cssFamily: c.cssFamily, family: c.family, files: [] };
      e.files.push(c);
      m.set(c.cssFamily, e);
    }
    return [...m.values()];
  }, [fonts]);

  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  const groups = (Object.keys(FONT_CATEGORIES) as FontDef['category'][]).map((cat) => ({ cat, list: FONTS.filter((f) => f.category === cat && match(f.family)) }));

  const upload = async (files: FileList | null) => {
    if (!files?.length || !projectId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f, f.name);
      const r = await fetch(`/api/projects/${projectId}/fonts`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Не вдалося завантажити');
      onFontsChanged?.(j.fonts);
      if (j.added?.length) {
        onChange(j.added[0].cssFamily);
        toast(`Додано: ${[...new Set(j.added.map((a: CustomFont) => a.family))].join(', ')}`);
      }
      for (const w of j.warnings ?? []) toast(w, 'error');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const removeFamily = async (cssFamily: string) => {
    if (!projectId) return;
    const files = fonts.filter((f) => f.cssFamily === cssFamily);
    if (!confirm(`Видалити шрифт «${files[0]?.family}»? Тексти з ним перейдуть на запасний шрифт.`)) return;
    let list = fonts;
    for (const f of files) {
      const r = await fetch(`/api/projects/${projectId}/fonts/${f.id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (r.ok) list = (await r.json()).fonts;
    }
    onFontsChanged?.(list);
  };

  const Row = ({ family, label, onDelete, meta }: { family: string; label: string; onDelete?: () => void; meta?: string }) => (
    <div
      role="option"
      aria-selected={value === family}
      title={label}
      className={`group flex items-center gap-2 h-11 px-2.5 rounded-xl cursor-pointer ${value === family ? 'bg-brand-50' : 'hover:bg-ink-50'}`}
      onClick={() => {
        onChange(family);
        setOpen(false);
      }}
    >
      <div className="flex-1 min-w-0 h-full flex items-center overflow-hidden">
        <img src={preview(family)} alt={label} loading="lazy" className="h-[22px] w-auto max-w-none select-none pointer-events-none" draggable={false} />
      </div>
      {meta && <span className="text-[10px] text-ink-400 shrink-0">{meta}</span>}
      {value === family && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
      {onDelete && (
        <button
          className="w-7 h-7 -mr-1 rounded-lg flex items-center justify-center text-ink-400 opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-red-600 shrink-0"
          title="Видалити шрифт"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <>
      <button ref={btn} type="button" data-testid="font-picker" className="ed-input flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="flex-1 truncate">{familyLabel(value, fonts)}</span>
        <ChevronDown className="w-4 h-4 text-ink-400 shrink-0" />
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="fixed z-[90] w-[320px] rounded-2xl bg-surface border border-ink-200/70 shadow-lift flex flex-col animate-pop-in" style={{ left: pos.left, top: pos.top, maxHeight: pos.maxH }}>
            <div className="p-2 border-b border-ink-100">
              <div className="relative">
                <Search className="w-4 h-4 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input autoFocus className="ed-input pl-8" placeholder="Пошук шрифту" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
              </div>
            </div>
            <div className="overflow-y-auto p-1.5" role="listbox">
              {projectId && (
                <div className="mb-1">
                  <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Ваші шрифти</span>
                    <button className="text-[12px] font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1" disabled={busy} onClick={() => file.current?.click()}>
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Завантажити
                    </button>
                  </div>
                  {families.filter((f) => match(f.family)).map((f) => (
                    <Row key={f.cssFamily} family={f.cssFamily} label={f.family} meta={f.files.length > 1 ? `${f.files.length} накреслення` : undefined} onDelete={() => removeFamily(f.cssFamily)} />
                  ))}
                  {!families.length && (
                    <button className="w-full text-left px-2.5 py-2 rounded-xl text-[12px] text-ink-500 hover:bg-ink-50 leading-snug" onClick={() => file.current?.click()}>
                      Завантажте фірмовий шрифт у форматі TTF або OTF. Можна кілька файлів одразу — Regular, Bold, Italic.
                    </button>
                  )}
                  <input ref={file} type="file" multiple accept=".ttf,.otf,.woff,font/ttf,font/otf" className="hidden" onChange={(e) => upload(e.target.files)} />
                </div>
              )}
              {groups.map(
                (g) =>
                  g.list.length > 0 && (
                    <div key={g.cat} className="mb-1">
                      <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{FONT_CATEGORIES[g.cat]}</div>
                      {g.list.map((f) => (
                        <Row key={f.family} family={f.family} label={f.family} />
                      ))}
                    </div>
                  ),
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
