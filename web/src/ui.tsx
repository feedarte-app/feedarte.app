import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Check, AlertTriangle, MoreHorizontal } from 'lucide-react';

export function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/25 backdrop-blur-[3px] p-4 pt-[7vh] overflow-y-auto animate-backdrop" onMouseDown={onClose}>
      <div className={`island w-full ${width} p-0 shadow-lift animate-pop-in`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
          <button className="w-8 h-8 rounded-full flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition" onClick={onClose} aria-label="Закрити">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
        {items.map((t) => (
          <div key={t.id} className={`flex items-center gap-2.5 rounded-full pl-2 pr-5 py-2 text-sm shadow-lift animate-slide-up ${t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-ink-900 text-white'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center ${t.kind === 'error' ? 'bg-surface/20' : 'bg-brand-500'}`}>
              {t.kind === 'error' ? <AlertTriangle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    ok: ['bg-emerald-50 text-emerald-700', 'Оновлено'],
    new: ['bg-ink-100 text-ink-700', 'Новий'],
    queued: ['bg-amber-50 text-amber-700', 'У черзі'],
    syncing: ['bg-brand-50 text-brand-700', 'Синхронізація…'],
    rendering: ['bg-brand-50 text-brand-700', 'Рендер…'],
    error: ['bg-red-50 text-red-700', 'Помилка'],
    idle: ['bg-ink-100 text-ink-700', 'Не опубліковано'],
    unchanged: ['bg-ink-100 text-ink-700', 'Без змін'],
    running: ['bg-brand-50 text-brand-700', 'Виконується'],
    active: ['bg-emerald-50 text-emerald-700', 'Активний'],
    pending: ['bg-amber-50 text-amber-700', 'Очікує'],
    blocked: ['bg-red-50 text-red-700', 'Заблоковано'],
  };
  const [cls, label] = map[status] ?? ['bg-ink-100 text-ink-700', status];
  return <span className={`chip ${cls}`}>{label}</span>;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="island flex flex-col items-center justify-center text-center py-16 px-6 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-brand-50 to-brand-100 flex items-center justify-center text-brand-600 mb-4 shadow-[inset_0_0_0_1px_rgba(255,107,26,.15)]">{icon}</div>
      <div className="font-semibold text-[17px] tracking-tight">{title}</div>
      {text && <div className="text-sm text-ink-500 mt-1 max-w-md">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className="input h-9 rounded-full font-mono text-xs" onFocus={(e) => e.target.select()} />
      <button
        className={`btn-sm h-9 ${copied ? 'btn bg-emerald-50 text-emerald-700 border border-emerald-200' : 'btn-outline'}`}
        onClick={() => {
          copyText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Скопійовано' : 'Копіювати'}
      </button>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export type MenuItem = { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string } | 'sep';

/** "⋯" button with a small popover menu (secondary actions live here, not as rows of icons) */
export function MoreMenu({ items, label = 'Ще дії', testId, size = 'sm' }: { items: MenuItem[]; label?: string; testId?: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement | null>(null);
  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      // page coordinates: the menu scrolls together with the page instead of closing
      setPos({ top: r.bottom + 6 + window.scrollY, left: Math.max(8, Math.min(r.right - 240, window.innerWidth - 248)) + window.scrollX });
    }
    setOpen((o) => !o);
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <>
      <button ref={btn} data-testid={testId} className={`btn-outline ${size === 'sm' ? 'btn-sm px-2.5' : 'px-3.5'}`} title={label} aria-label={label} aria-expanded={open} onClick={toggle}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[80]" onMouseDown={() => setOpen(false)} />
            <div className="absolute z-[81] w-60 rounded-2xl bg-surface border border-ink-200/70 shadow-lift p-1.5 animate-pop-in" style={pos} role="menu">
              {items.map((it, i) =>
                it === 'sep' ? (
                  <div key={i} className="h-px bg-ink-100 my-1" />
                ) : (
                  <button
                    key={i}
                    role="menuitem"
                    disabled={it.disabled}
                    title={it.hint}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-left disabled:opacity-40 ${it.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-700 hover:bg-ink-50'}`}
                    onClick={() => {
                      setOpen(false);
                      it.onClick();
                    }}
                  >
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4">{it.icon}</span>
                    {it.label}
                  </button>
                ),
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/** collapsible settings section: closed it shows a one-line summary of the current value */
export function Section({ title, summary, children, defaultOpen = false, testId }: { title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-ink-200/80" data-testid={testId}>
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-ink-900">{title}</div>
          {!open && summary && <div className="text-[12px] text-ink-500 truncate mt-0.5">{summary}</div>}
        </div>
        <span className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

/** copy text: Clipboard API when allowed, textarea fallback otherwise (never throws) */
export function copyText(text: string) {
  const fallback = () => {
    try {
      const a = document.createElement('textarea');
      a.value = text;
      a.style.position = 'fixed';
      a.style.opacity = '0';
      document.body.appendChild(a);
      a.select();
      document.execCommand('copy');
      document.body.removeChild(a);
    } catch {
      /* ignore */
    }
  };
  try {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  } catch {
    fallback();
  }
}
