import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Section({ title, children, right, defaultOpen = true }: { title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ink-100 last:border-0 px-5 py-4">
      <div className="flex items-center justify-between mb-0">
        <button className="eyebrow !text-ink-500 hover:!text-ink-900 flex items-center gap-1 transition-colors" onClick={() => setOpen(!open)}>
          {title}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        </button>
        {right}
      </div>
      {open && <div className="mt-3.5 space-y-2.5 animate-fade-in">{children}</div>}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[86px_1fr] items-center gap-2">
      <span className="ed-label truncate" title={label}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function NumberInput({
  value, onChange, prefix, suffix, step = 1, min, max, className = '',
}: { value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number; min?: number; max?: number; className?: string }) {
  const [text, setText] = useState(String(round(value)));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(round(value)));
  }, [value]);
  const commit = (s: string) => {
    let n = Number(s.replace(',', '.'));
    if (!Number.isFinite(n)) {
      setText(String(round(value)));
      return;
    }
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onChange(n);
    setText(String(round(n)));
  };
  return (
    <div className={`relative ${className}`}>
      {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-400 pointer-events-none">{prefix}</span>}
      <input
        className={`ed-input ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-6' : ''}`}
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step);
            let n = round(value + d);
            if (min != null) n = Math.max(min, n);
            if (max != null) n = Math.min(max, n);
            onChange(n);
            setText(String(n));
          }
          e.stopPropagation();
        }}
      />
      {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-400 pointer-events-none">{suffix}</span>}
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function toHex6(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('');
  if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7);
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  return '#000000';
}

export const SWATCHES = ['#111111', '#ffffff', '#E53935', '#E0115F', '#FF8A00', '#FFD60A', '#2E7D32', '#3B5BDB', '#C9A86A', '#8A8A8E', '#F5F5F7', 'transparent'];

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value), [value]);
  return (
    <div className="relative flex items-center gap-1.5">
      <button
        className="w-10 h-10 rounded-xl border border-ink-200 shrink-0 shadow-sm hover:scale-105 transition"
        style={{ background: value === 'transparent' ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 50%/10px 10px' : value }}
        onClick={() => setOpen(!open)}
      />
      <input
        className="ed-input font-mono uppercase"
        value={text.replace('#', '')}
        onChange={(e) => setText(e.target.value.startsWith('rgb') || e.target.value === 'transparent' ? e.target.value : '#' + e.target.value.replace('#', ''))}
        onBlur={() => onChange(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChange(text);
          e.stopPropagation();
        }}
      />
      {open && (
        <div className="absolute z-30 top-12 left-0 island shadow-lift p-3 w-60 animate-pop-in" onMouseLeave={() => setOpen(false)}>
          <div className="grid grid-cols-6 gap-1.5 mb-2">
            {SWATCHES.map((s) => (
              <button
                key={s}
                className="w-7 h-7 rounded-lg border border-ink-200 hover:scale-110 transition"
                style={{ background: s === 'transparent' ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 50%/8px 8px' : s }}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <input type="color" className="w-full h-8 cursor-pointer" value={toHex6(value)} onChange={(e) => onChange(e.target.value)} />
        </div>
      )}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} data-on={value === o.v} title={o.title} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
      <span className="text-[13px] text-ink-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition ${checked ? 'bg-brand-500' : 'bg-ink-300'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}
