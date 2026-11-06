// Editor-only overlays: crop zones, Stories/Reels UI safe zones, Figma-like rulers with draggable guides.
// Nothing here is rendered into the creative.
import { useState } from 'react';

export type ViewOpts = { crop: boolean; stories: boolean; reels: boolean; rulers: boolean };
export type UserGuide = { axis: 'x' | 'y'; pos: number };

export const DEFAULT_VIEW: ViewOpts = { crop: true, stories: false, reels: false, rulers: false };

const RULER = 20; // px

/** centered crop areas Meta may cut a tall creative down to (feed carousels show 1:1; 9:16 shown in feed → 4:5) */
export function cropZones(w: number, h: number) {
  const out: { label: string; x: number; y: number; w: number; h: number; color: string; shade: boolean }[] = [];
  if (h <= w) return out;
  const r45 = (w * 5) / 4;
  if (h > r45 + 2) out.push({ label: '4:5', x: 0, y: (h - r45) / 2, w, h: r45, color: '#0ea5e9', shade: false });
  out.push({ label: '1:1', x: 0, y: (h - w) / 2, w, h: w, color: '#f97316', shade: true });
  return out;
}

/** areas covered by Instagram/Facebook UI (Meta guidance: Stories ~14% top / 20% bottom, Reels 14% top / 35% bottom / 6% sides) */
export function uiZones(kind: 'stories' | 'reels', w: number, h: number) {
  const z: { x: number; y: number; w: number; h: number; label: string }[] = [];
  if (kind === 'stories') {
    const top = Math.round(h * 0.13);
    const bottom = Math.round(h * 0.177);
    z.push({ x: 0, y: 0, w, h: top, label: 'Stories: аватар і назва сторінки' });
    z.push({ x: 0, y: h - bottom, w, h: bottom, label: 'Stories: кнопка і поле повідомлення' });
  } else {
    const top = Math.round(h * 0.14);
    const bottom = Math.round(h * 0.35);
    const side = Math.round(w * 0.06);
    z.push({ x: 0, y: 0, w, h: top, label: 'Reels: заголовок і камера' });
    z.push({ x: 0, y: h - bottom, w, h: bottom, label: 'Reels: підпис, кнопка, профіль' });
    z.push({ x: 0, y: top, w: side, h: h - top - bottom, label: '' });
    z.push({ x: w - side * 2, y: top, w: side * 2, h: h - top - bottom, label: 'іконки' });
  }
  return z;
}

export function ZonesOverlay({ w, h, zoom, view }: { w: number; h: number; zoom: number; view: ViewOpts }) {
  const crop = view.crop ? cropZones(w, h) : [];
  const ui = [...(view.stories ? uiZones('stories', w, h).map((z) => ({ ...z, c: '239,68,68' })) : []), ...(view.reels ? uiZones('reels', w, h).map((z) => ({ ...z, c: '168,85,247' })) : [])];
  if (!crop.length && !ui.length) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {ui.map((z, i) => (
        <div
          key={`u${i}`}
          data-testid="ui-zone"
          className="absolute"
          style={{ left: z.x * zoom, top: z.y * zoom, width: z.w * zoom, height: z.h * zoom, background: `repeating-linear-gradient(45deg, rgba(${z.c},0.20) 0 6px, rgba(${z.c},0.10) 6px 12px)`, outline: `1px dashed rgba(${z.c},0.8)` }}
        >
          {z.label && <div className="absolute left-1 top-1 text-[10px] font-semibold text-white rounded px-1.5 py-0.5 whitespace-nowrap" style={{ background: `rgb(${z.c})` }}>{z.label}</div>}
        </div>
      ))}
      {crop.map((zn) => (
        <div key={zn.label} data-testid={`safe-zone-${zn.label}`} className="absolute border border-dashed" style={{ left: zn.x * zoom, top: zn.y * zoom, width: zn.w * zoom, height: zn.h * zoom, borderColor: zn.color, boxShadow: zn.shade ? '0 0 0 9999px rgba(15,15,20,0.18)' : undefined }}>
          <div className="absolute top-1 right-1 text-[10px] font-semibold rounded px-1.5 py-0.5 text-white" style={{ background: zn.color }}>{zn.label}</div>
        </div>
      ))}
    </div>
  );
}

function niceStep(zoom: number) {
  for (const s of [10, 20, 25, 50, 100, 200, 250, 500]) if (s * zoom >= 48) return s;
  return 1000;
}

/** rulers along the top/left edges; drag from a ruler to create a guide, drag a guide back onto it to remove */
export function Rulers({ w, h, zoom, guides, onChange }: { w: number; h: number; zoom: number; guides: UserGuide[]; onChange: (g: UserGuide[]) => void }) {
  const [drag, setDrag] = useState<{ i: number; axis: 'x' | 'y'; pos: number; out: boolean } | null>(null);
  const step = niceStep(zoom);

  const start = (e: React.PointerEvent, axis: 'x' | 'y', index: number | null) => {
    e.stopPropagation();
    e.preventDefault();
    const stage = (e.currentTarget as HTMLElement).closest('[data-stage-root]') as HTMLElement;
    const rect = stage.getBoundingClientRect();
    let list = guides.slice();
    let i = index ?? -1;
    const isNew = i < 0;
    let moved = false;
    let outNow = false;
    if (i < 0) {
      list = [...list, { axis, pos: 0 }];
      i = list.length - 1;
    }
    const move = (ev: PointerEvent) => {
      const raw = axis === 'y' ? (ev.clientY - rect.top) / zoom : (ev.clientX - rect.left) / zoom;
      const out = raw < -2 || raw > (axis === 'y' ? h : w) + 2;
      const pos = Math.round(ev.shiftKey ? Math.round(raw / 10) * 10 : raw);
      moved = true;
      outNow = out;
      list = list.map((g, j) => (j === i ? { ...g, pos } : g));
      setDrag({ i, axis, pos, out });
      onChange(list);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if ((isNew && !moved) || (moved && outNow)) onChange(list.filter((_, j) => j !== i));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ticks = (len: number) => {
    const out: number[] = [];
    for (let v = 0; v <= len; v += step) out.push(v);
    return out;
  };

  return (
    <>
      {/* top ruler → horizontal guides */}
      <div
        data-testid="ruler-top"
        className="absolute left-0 bg-white/95 border-b border-ink-200 cursor-row-resize select-none overflow-hidden"
        style={{ top: -RULER, height: RULER, width: w * zoom }}
        onPointerDown={(e) => start(e, 'y', null)}
        title="Потягніть вниз, щоб додати горизонтальну напрямну"
      >
        {ticks(w).map((v) => (
          <div key={v} className="absolute bottom-0 border-l border-ink-300" style={{ left: v * zoom, height: v % (step * 2) === 0 ? 8 : 4 }}>
            {v % (step * 2) === 0 && <span className="absolute -top-[11px] left-0.5 text-[9px] text-ink-400 tabular-nums">{v}</span>}
          </div>
        ))}
      </div>
      {/* left ruler → vertical guides */}
      <div
        data-testid="ruler-left"
        className="absolute top-0 bg-white/95 border-r border-ink-200 cursor-col-resize select-none overflow-hidden"
        style={{ left: -RULER, width: RULER, height: h * zoom }}
        onPointerDown={(e) => start(e, 'x', null)}
        title="Потягніть вправо, щоб додати вертикальну напрямну"
      >
        {ticks(h).map((v) => (
          <div key={v} className="absolute right-0 border-t border-ink-300" style={{ top: v * zoom, width: v % (step * 2) === 0 ? 8 : 4 }}>
            {v % (step * 2) === 0 && <span className="absolute top-0.5 -left-[13px] text-[9px] text-ink-400 tabular-nums [writing-mode:vertical-rl] rotate-180">{v}</span>}
          </div>
        ))}
      </div>
      <div className="absolute bg-white border-r border-b border-ink-200" style={{ left: -RULER, top: -RULER, width: RULER, height: RULER }} />
      {/* guides */}
      {guides.map((g, i) => {
        const active = drag?.i === i;
        const style: React.CSSProperties =
          g.axis === 'y'
            ? { left: -RULER, width: w * zoom + RULER, top: g.pos * zoom - 3, height: 7, cursor: 'row-resize' }
            : { top: -RULER, height: h * zoom + RULER, left: g.pos * zoom - 3, width: 7, cursor: 'col-resize' };
        return (
          <div key={i} data-testid="user-guide" className="absolute z-20 group" style={style} onPointerDown={(e) => start(e, g.axis, i)} title="Тягніть, щоб посунути; на лінійку — щоб прибрати">
            <div className={`absolute ${g.axis === 'y' ? 'left-0 right-0 top-[3px] h-px' : 'top-0 bottom-0 left-[3px] w-px'} ${active && drag?.out ? 'bg-red-300' : 'bg-red-500'}`} />
            <div className={`absolute ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} text-[10px] font-semibold text-white bg-red-500 rounded px-1 py-px tabular-nums pointer-events-none`} style={g.axis === 'y' ? { left: RULER + 4, top: -14 } : { top: RULER + 4, left: 6 }}>
              {active && drag?.out ? 'прибрати' : g.pos}
            </div>
          </div>
        );
      })}
    </>
  );
}

const VIEW_ITEMS: { key: keyof ViewOpts; label: string; hint: string; show: (w: number, h: number) => boolean }[] = [
  { key: 'rulers', label: 'Лінійки та напрямні', hint: 'Shift+R. Тягніть з лінійки, щоб додати лінію', show: () => true },
  { key: 'crop', label: 'Зони обрізання 1:1 / 4:5', hint: 'Що лишиться, якщо Meta обріже по центру', show: (w, h) => h > w },
  { key: 'stories', label: 'Безпечні зони Stories', hint: 'Верх ~13% і низ ~18% закриває інтерфейс', show: (w, h) => h / w > 1.5 },
  { key: 'reels', label: 'Безпечні зони Reels', hint: 'Верх 14%, низ 35%, іконки праворуч', show: (w, h) => h / w > 1.5 },
];

export function ViewMenu({ w, h, view, onView, guides, onClearGuides }: { w: number; h: number; view: ViewOpts; onView: (v: ViewOpts) => void; guides: number; onClearGuides: () => void }) {
  const [open, setOpen] = useState(false);
  const items = VIEW_ITEMS.filter((i) => i.show(w, h));
  const on = items.filter((i) => view[i.key]).length;
  return (
    <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
      <button
        data-testid="view-menu"
        className={`text-[11px] font-medium rounded-full px-2.5 py-0.5 border transition ${on ? 'bg-ink-900 border-ink-900 text-white' : 'bg-white/80 border-ink-200 text-ink-600 hover:border-ink-300'}`}
        onClick={() => setOpen((o) => !o)}
        title="Лінійки, напрямні, безпечні зони — видно лише в редакторі"
      >
        Відображення{on ? ` · ${on}` : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-50 w-72 rounded-2xl bg-white border border-ink-200/70 shadow-lift p-1.5">
            {items.map((i) => (
              <label key={i.key} className="flex items-start gap-2.5 px-2.5 py-2 rounded-xl hover:bg-ink-50 cursor-pointer">
                <input type="checkbox" data-testid={`view-${i.key}`} className="mt-0.5" checked={view[i.key]} onChange={(e) => onView({ ...view, [i.key]: e.target.checked })} />
                <span>
                  <span className="block text-[13px] font-medium text-ink-800">{i.label}</span>
                  <span className="block text-[11px] text-ink-500 leading-snug">{i.hint}</span>
                </span>
              </label>
            ))}
            {guides > 0 && (
              <button className="w-full text-left px-2.5 py-2 rounded-xl text-[12px] text-red-600 hover:bg-red-50" onClick={onClearGuides}>
                Прибрати всі напрямні ({guides})
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function loadView(): ViewOpts {
  try {
    return { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem('fa_view') ?? '{}') };
  } catch {
    return DEFAULT_VIEW;
  }
}
export function saveView(v: ViewOpts) {
  try {
    localStorage.setItem('fa_view', JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
export function loadGuides(designId: string): UserGuide[] {
  try {
    return JSON.parse(localStorage.getItem(`fa_guides_${designId}`) ?? '[]');
  } catch {
    return [];
  }
}
export function saveGuides(designId: string, g: UserGuide[]) {
  try {
    localStorage.setItem(`fa_guides_${designId}`, JSON.stringify(g));
  } catch {
    /* ignore */
  }
}
