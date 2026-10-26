import { Plus, X } from 'lucide-react';
import type { Condition, ConditionRule, FeedField } from '../../../src/shared/types';
import { COMPUTED_FIELDS, OPS } from '../../../src/shared/fields';

export function fieldOptions(fields: FeedField[]) {
  return [
    ...COMPUTED_FIELDS.map((f) => ({ key: f.key, label: `${f.label}` })),
    ...fields.map((f) => ({ key: f.key, label: f.key })),
  ];
}

export function ConditionEditor({
  value,
  onChange,
  fields,
  actionLabels = ['Показати', 'Приховати'],
  showAction = true,
}: {
  value: Condition | null | undefined;
  onChange: (c: Condition | null) => void;
  fields: FeedField[];
  actionLabels?: [string, string];
  showAction?: boolean;
}) {
  const opts = fieldOptions(fields);
  const c: Condition = value ?? { action: 'show', mode: 'all', rules: [] };
  const set = (patch: Partial<Condition>) => {
    const next = { ...c, ...patch };
    onChange(next.rules.length ? next : null);
  };
  const setRule = (i: number, patch: Partial<ConditionRule>) => set({ rules: c.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-2.5">
      {c.rules.length > 0 && showAction && (
        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
          <span className="ed-label">Видимість</span>
          <div className="seg">
            <button type="button" data-on={c.action === 'show'} onClick={() => set({ action: 'show' })}>{actionLabels[0]}</button>
            <button type="button" data-on={c.action === 'hide'} onClick={() => set({ action: 'hide' })}>{actionLabels[1]}</button>
          </div>
        </div>
      )}
      {c.rules.length > 1 && (
        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
          <span className="ed-label">Якщо</span>
          <div className="seg">
            <button type="button" data-on={c.mode === 'all'} onClick={() => set({ mode: 'all' })}>усі умови</button>
            <button type="button" data-on={c.mode === 'any'} onClick={() => set({ mode: 'any' })}>будь-яка</button>
          </div>
        </div>
      )}
      {c.rules.map((r, i) => {
        const op = OPS.find((o) => o.op === r.op);
        return (
          <div key={i} className="rounded-lg border border-ink-200 p-2 space-y-1.5 relative">
            <button type="button" className="absolute top-1.5 right-1.5 text-ink-400 hover:text-ink-900" onClick={() => set({ rules: c.rules.filter((_, j) => j !== i) })}>
              <X className="w-3.5 h-3.5" />
            </button>
            <select className="ed-input pr-6" value={r.field} onChange={(e) => setRule(i, { field: e.target.value })}>
              {!opts.some((o) => o.key === r.field) && <option value={r.field}>{r.field}</option>}
              <optgroup label="Обчислювані">
                {opts.slice(0, COMPUTED_FIELDS.length).map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </optgroup>
              <optgroup label="Поля фіду">
                {opts.slice(COMPUTED_FIELDS.length).map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </optgroup>
            </select>
            <div className="flex gap-1.5">
              <select className="ed-input" value={r.op} onChange={(e) => setRule(i, { op: e.target.value as ConditionRule['op'] })}>
                {OPS.map((o) => (
                  <option key={o.op} value={o.op}>{o.label}</option>
                ))}
              </select>
              {op?.needsValue && <input className="ed-input" placeholder="значення" value={r.value ?? ''} onChange={(e) => setRule(i, { value: e.target.value })} />}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn-ghost btn-sm w-full border border-dashed border-ink-300"
        onClick={() => set({ rules: [...c.rules, { field: 'has_discount', op: 'exists' }] })}
      >
        <Plus className="w-3.5 h-3.5" /> Додати умову
      </button>
    </div>
  );
}
