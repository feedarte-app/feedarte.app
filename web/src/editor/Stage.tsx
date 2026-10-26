import { useEffect, useRef, useState } from 'react';
import type { DesignDoc, Layer, LogoMaps, ProductData } from '../../../src/shared/types';
import { drawDesign, effectiveBox, type ResolvedDesign } from '../../../src/shared/render';
import { loadFonts, loadImages, resolveFor } from './browserRender';

type Box = { x: number; y: number; w: number; h: number };
type Guide = { axis: 'x' | 'y'; pos: number };

interface Props {
  doc: DesignDoc;
  product: ProductData | null;
  zoom: number;
  ghost: boolean; // show condition-hidden layers semi-transparent
  maps: LogoMaps;
  selectedIds: string[];
  /** select a layer (group-aware); returns the resulting selection */
  onPick: (id: string | null, additive: boolean) => string[];
  onChangeLayer: (id: string, patch: Partial<Layer>, mergeKey: string) => void;
  onChangeLayers: (patches: { id: string; patch: Partial<Layer> }[], mergeKey: string) => void;
  onGestureEnd: () => void;
  onDoubleClick: (id: string) => void;
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

export function Stage({ doc, product, zoom, ghost, maps, selectedIds, onPick, onChangeLayer, onChangeLayers, onGestureEnd, onDoubleClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resolved, setResolved] = useState<ResolvedDesign | null>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [guides, setGuides] = useState<Guide[]>([]);
  const seq = useRef(0);

  // render
  useEffect(() => {
    const my = ++seq.current;
    (async () => {
      await loadFonts();
      const r = resolveFor(doc, product, maps);
      const images = await loadImages(r, ghost);
      if (my !== seq.current) return;
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const scale = zoom * dpr;
      const W = Math.round(doc.width * scale);
      const H = Math.round(doc.height * scale);
      if (c.width !== W) c.width = W;
      if (c.height !== H) c.height = H;
      const g = c.getContext('2d')!;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      drawDesign(g, r, images, { ghostHidden: ghost });
      const b: Record<string, Box> = {};
      g.save();
      for (const rl of r.layers) b[rl.layer.id] = effectiveBox(g, rl);
      g.restore();
      setBoxes(b);
      setResolved(r);
    })();
  }, [doc, product, zoom, ghost, maps]);

  const selected = selectedIds.length === 1 ? doc.layers.find((l) => l.id === selectedIds[0]) ?? null : null;
  const multi = selectedIds.length > 1 ? doc.layers.filter((l) => selectedIds.includes(l.id)) : [];
  const unionOf = (ls: Layer[]): Box | null => {
    if (!ls.length) return null;
    const bs = ls.map((l) => boxes[l.id] ?? l);
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
  };

  function snap(id: string | string[], box: Box): { dx: number; dy: number; guides: Guide[] } {
    const th = 6 / zoom;
    const xs = [0, doc.width / 2, doc.width];
    const ys = [0, doc.height / 2, doc.height];
    for (const l of doc.layers) {
      if ((Array.isArray(id) ? id.includes(l.id) : l.id === id) || !l.visible) continue;
      const b = boxes[l.id] ?? l;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    const mine = { x: [box.x, box.x + box.w / 2, box.x + box.w], y: [box.y, box.y + box.h / 2, box.y + box.h] };
    let best = { d: th + 1, dx: 0, pos: 0 };
    for (const t of xs) for (const m of mine.x) if (Math.abs(t - m) < Math.abs(best.d)) best = { d: Math.abs(t - m), dx: t - m, pos: t };
    let bestY = { d: th + 1, dy: 0, pos: 0 };
    for (const t of ys) for (const m of mine.y) if (Math.abs(t - m) < Math.abs(bestY.d)) bestY = { d: Math.abs(t - m), dy: t - m, pos: t };
    const gs: Guide[] = [];
    const dx = best.d <= th ? best.dx : 0;
    const dy = bestY.d <= th ? bestY.dy : 0;
    if (best.d <= th) gs.push({ axis: 'x', pos: best.pos });
    if (bestY.d <= th) gs.push({ axis: 'y', pos: bestY.pos });
    return { dx, dy, guides: gs };
  }

  function startMove(e: React.PointerEvent, l: Layer) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const ids = selectedIds.includes(l.id) && !e.shiftKey ? selectedIds : onPick(l.id, e.shiftKey);
    if (e.shiftKey) return;
    const movable = doc.layers.filter((x) => ids.includes(x.id) && !x.locked);
    if (!movable.length) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const origins = movable.map((m) => ({ id: m.id, x: m.x, y: m.y }));
    const u = unionOf(movable)!;
    const key = `move:${ids.join(',')}`;
    let moved = false;
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - sx) / zoom;
      let dy = (ev.clientY - sy) / zoom;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 2 / zoom) return;
      moved = true;
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (!ev.altKey) {
        const s = snap(ids, { x: u.x + dx, y: u.y + dy, w: u.w, h: u.h });
        dx += s.dx;
        dy += s.dy;
        setGuides(s.guides);
      }
      onChangeLayers(origins.map((o) => ({ id: o.id, patch: { x: Math.round(o.x + dx), y: Math.round(o.y + dy) } })), key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuides([]);
      onGestureEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startResize(e: React.PointerEvent, l: Layer, h: Handle) {
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const o = { x: l.x, y: l.y, w: l.w, h: l.h };
    const rad = ((l.rotation || 0) * Math.PI) / 180;
    const ratio = o.w / o.h;
    const move = (ev: PointerEvent) => {
      const gx = (ev.clientX - sx) / zoom;
      const gy = (ev.clientY - sy) / zoom;
      // pointer delta in the layer's local (unrotated) frame
      const dx = gx * Math.cos(rad) + gy * Math.sin(rad);
      const dy = -gx * Math.sin(rad) + gy * Math.cos(rad);
      let { x, y, w, h: hh } = o;
      if (h.includes('e')) w = o.w + dx;
      if (h.includes('w')) {
        w = o.w - dx;
        x = o.x + dx;
      }
      if (h.includes('s')) hh = o.h + dy;
      if (h.includes('n')) {
        hh = o.h - dy;
        y = o.y + dy;
      }
      const keep = ev.shiftKey || l.type === 'icon';
      if (keep && h.length === 2) {
        if (w / hh > ratio) w = hh * ratio;
        else hh = w / ratio;
        if (h.includes('w')) x = o.x + o.w - w;
        if (h.includes('n')) y = o.y + o.h - hh;
      }
      w = Math.max(8, w);
      hh = Math.max(8, hh);
      onChangeLayer(l.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) }, `resize:${l.id}`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onGestureEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startRotate(e: React.PointerEvent, l: Layer) {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.currentTarget.parentElement!.parentElement as HTMLElement).getBoundingClientRect();
    const cx = rect.left + (l.x + l.w / 2) * zoom;
    const cy = rect.top + (l.y + l.h / 2) * zoom;
    const move = (ev: PointerEvent) => {
      let a = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      else if (Math.abs(a % 45) < 3 || Math.abs(a % 45) > 42) a = Math.round(a / 45) * 45;
      a = ((Math.round(a) % 360) + 540) % 360 - 180;
      onChangeLayer(l.id, { rotation: a }, `rotate:${l.id}`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onGestureEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const W = doc.width * zoom;
  const H = doc.height * zoom;
  const hitLayers = resolved
    ? resolved.layers.filter((rl) => rl.layer.visible && (ghost || !rl.condHidden))
    : [];

  return (
    <div className="relative shadow-[0_2px_20px_rgba(0,0,0,0.08)]" style={{ width: W, height: H }} onPointerDown={() => onPick(null, false)}>
      <canvas ref={canvasRef} style={{ width: W, height: H, display: 'block' }} />
      <div className="absolute inset-0">
        {hitLayers.map(({ layer: l }) => {
          const b = boxes[l.id] ?? l;
          return (
            <div
              key={l.id}
              className={`absolute ${l.locked ? 'cursor-default' : 'cursor-move'} hover:outline hover:outline-1 hover:outline-brand-500/60`}
              style={{
                left: b.x * zoom,
                top: b.y * zoom,
                width: b.w * zoom,
                height: b.h * zoom,
                transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
                transformOrigin: `${(l.x + l.w / 2 - b.x) * zoom}px ${(l.y + l.h / 2 - b.y) * zoom}px`,
              }}
              onPointerDown={(e) => startMove(e, l)}
              onDoubleClick={() => onDoubleClick(l.id)}
            />
          );
        })}
        {multi.length > 0 && (() => {
          const u = unionOf(multi)!;
          return (
            <>
              {multi.map((l) => {
                const b = boxes[l.id] ?? l;
                return <div key={l.id} className="absolute border border-brand-400/70 pointer-events-none" style={{ left: b.x * zoom, top: b.y * zoom, width: b.w * zoom, height: b.h * zoom, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined }} />;
              })}
              <div className="absolute border-[1.5px] border-dashed border-brand-500 rounded-sm pointer-events-none" style={{ left: u.x * zoom - 4, top: u.y * zoom - 4, width: u.w * zoom + 8, height: u.h * zoom + 8 }}>
                <div className="absolute -top-6 left-0 text-[10px] bg-brand-500 text-white rounded-full px-2 py-0.5 whitespace-nowrap">{multi.length} елем.</div>
              </div>
            </>
          );
        })()}
        {selected && (
          <SelectionBox
            l={selected}
            box={boxes[selected.id] ?? selected}
            zoom={zoom}
            onMove={(e) => startMove(e, selected)}
            onResize={(e, h) => startResize(e, selected, h)}
            onRotate={(e) => startRotate(e, selected)}
          />
        )}
        {guides.map((g, i) =>
          g.axis === 'x' ? (
            <div key={i} className="absolute top-0 bottom-0 w-px bg-fuchsia-500 pointer-events-none" style={{ left: g.pos * zoom }} />
          ) : (
            <div key={i} className="absolute left-0 right-0 h-px bg-fuchsia-500 pointer-events-none" style={{ top: g.pos * zoom }} />
          ),
        )}
      </div>
    </div>
  );
}

function SelectionBox({ l, box, zoom, onMove, onResize, onRotate }: { l: Layer; box: Box; zoom: number; onMove: (e: React.PointerEvent) => void; onResize: (e: React.PointerEvent, h: Handle) => void; onRotate: (e: React.PointerEvent) => void }) {
  // selection shows the anchor box (l.x..) — for auto-width text also a dashed effective box
  const pos: Record<Handle, [number, number, string]> = {
    nw: [0, 0, 'nwse-resize'],
    n: [0.5, 0, 'ns-resize'],
    ne: [1, 0, 'nesw-resize'],
    e: [1, 0.5, 'ew-resize'],
    se: [1, 1, 'nwse-resize'],
    s: [0.5, 1, 'ns-resize'],
    sw: [0, 1, 'nesw-resize'],
    w: [0, 0.5, 'ew-resize'],
  };
  const differs = Math.abs(box.x - l.x) > 0.5 || Math.abs(box.w - l.w) > 0.5;
  return (
    <>
      {differs && (
        <div
          className="absolute border border-dashed border-brand-500/70 pointer-events-none"
          style={{ left: box.x * zoom, top: box.y * zoom, width: box.w * zoom, height: box.h * zoom, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined }}
        />
      )}
      <div
        className="absolute border-[1.5px] border-brand-500"
        style={{ left: l.x * zoom, top: l.y * zoom, width: l.w * zoom, height: l.h * zoom, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined, pointerEvents: 'none' }}
      >
        {!l.locked && (
          <>
            {HANDLES.map((h) => {
              const [px, py, cursor] = pos[h];
              return (
                <div
                  key={h}
                  className="absolute w-2.5 h-2.5 bg-white border-[1.5px] border-brand-500 rounded-[2px]"
                  style={{ left: `calc(${px * 100}% - 5px)`, top: `calc(${py * 100}% - 5px)`, cursor, pointerEvents: 'auto' }}
                  onPointerDown={(e) => onResize(e, h)}
                />
              );
            })}
            <div
              className="absolute w-3 h-3 bg-white border-[1.5px] border-brand-500 rounded-full"
              style={{ left: 'calc(50% - 6px)', top: -26, cursor: 'grab', pointerEvents: 'auto' }}
              onPointerDown={onRotate}
              title="Повернути (Shift — крок 15°)"
            />
            <div className="absolute w-px h-4 bg-brand-500" style={{ left: '50%', top: -16 }} />
          </>
        )}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] bg-brand-500 text-white rounded px-1 whitespace-nowrap pointer-events-none">
          {Math.round(l.w)} × {Math.round(l.h)}
        </div>
      </div>
      {void onMove}
    </>
  );
}
