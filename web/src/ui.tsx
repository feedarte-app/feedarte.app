import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { X, Loader2, Check, AlertTriangle } from 'lucide-react';

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
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh] overflow-y-auto" onMouseDown={onClose}>
      <div className={`card w-full ${width} p-0`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-200 px-5 h-14">
          <h3 className="font-semibold">{title}</h3>
          <button className="btn-ghost btn-sm px-2" onClick={onClose} aria-label="Закрити">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
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
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center">
        {items.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg ${t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-ink-900 text-white'}`}>
            {t.kind === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
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
    <div className="card flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center text-ink-500 mb-3">{icon}</div>
      <div className="font-semibold">{title}</div>
      {text && <div className="text-sm text-ink-500 mt-1 max-w-md">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className="input h-9 font-mono text-xs" onFocus={(e) => e.target.select()} />
      <button
        className="btn-outline btn-sm h-9"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Скопійовано' : 'Копіювати'}
      </button>
    </div>
  );
}
