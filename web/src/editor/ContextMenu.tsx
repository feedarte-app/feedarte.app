import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, CopyPlus, ClipboardPaste, Group, Ungroup, Trash2 } from 'lucide-react';
import type { DesignDoc } from '../../../src/shared/types';
import { selectedGroup } from './groups';

export interface LayerActions {
  duplicate: (ids: string[]) => void;
  copy: (ids: string[]) => void;
  paste: () => void;
  remove: (ids: string[]) => void;
  group: (ids: string[]) => string | undefined;
  ungroup: (gid: string) => void;
  moveBlock: (ids: string[], targetId: string) => void;
  hasClip: () => boolean;
}

export interface MenuState {
  x: number;
  y: number;
  ids: string[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const kb = (k: string) => (isMac ? `⌘${k}` : `Ctrl+${k}`);

export function ContextMenu({ menu, doc, actions, onClose }: { menu: MenuState; doc: DesignDoc; actions: LayerActions; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
  }, [menu.x, menu.y]);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('wheel', close, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const ids = menu.ids;
  const g = selectedGroup(doc, ids);
  const anyGrouped = ids.some((id) => doc.layers.find((l) => l.id === id)?.groupId);
  const what = g ? 'групу' : ids.length > 1 ? `${ids.length} елем.` : '';
  const items: ({ label: string; icon: any; hint?: string; danger?: boolean; run: () => void; off?: boolean } | '-')[] = [
    { label: `Дублювати ${what}`.trim(), icon: CopyPlus, hint: kb('D'), run: () => actions.duplicate(ids), off: !ids.length },
    { label: `Копіювати ${what}`.trim(), icon: Copy, hint: kb('C'), run: () => actions.copy(ids), off: !ids.length },
    { label: 'Вставити', icon: ClipboardPaste, hint: kb('V'), run: () => actions.paste(), off: !actions.hasClip() },
    '-',
    g
      ? { label: 'Розгрупувати', icon: Ungroup, hint: kb('⇧G'), run: () => actions.ungroup(g.id) }
      : { label: 'Згрупувати', icon: Group, hint: kb('G'), run: () => actions.group(ids), off: ids.length < 2 },
    '-',
    { label: g ? 'Видалити групу' : 'Видалити', icon: Trash2, hint: 'Del', danger: true, run: () => actions.remove(ids), off: !ids.length },
  ];
  void anyGrouped;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-testid="ctx-menu"
      className="fixed z-[100] min-w-[220px] rounded-2xl bg-white/95 backdrop-blur border border-ink-200/70 shadow-lift p-1.5 animate-pop-in text-[13px]"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it === '-' ? (
          <div key={i} className="h-px bg-ink-100 my-1 mx-2" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.off}
            className={`w-full flex items-center gap-2.5 px-2.5 h-8 rounded-xl text-left transition disabled:opacity-35 disabled:pointer-events-none ${it.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-800 hover:bg-ink-100'}`}
            onClick={() => {
              it.run();
              onClose();
            }}
          >
            <it.icon className="w-4 h-4 shrink-0 opacity-70" />
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className="text-[11px] text-ink-400">{it.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
