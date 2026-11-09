import { NICHES } from '../../src/shared/templates-lib';

export type NicheFilter = 'all' | 'mine' | (typeof NICHES)[number]['id'];

export function matchNiche(t: { builtin?: boolean; niches?: string[] }, f: NicheFilter) {
  if (f === 'all') return true;
  if (f === 'mine') return !t.builtin;
  return !!t.niches?.includes(f);
}

/** horizontal chip row to narrow the template gallery by niche */
export function NicheChips({ value, onChange, hasMine, compact }: { value: NicheFilter; onChange: (v: NicheFilter) => void; hasMine?: boolean; compact?: boolean }) {
  const items: { id: NicheFilter; label: string }[] = [{ id: 'all', label: 'Усі' }, ...NICHES, ...(hasMine ? [{ id: 'mine' as const, label: 'Мої' }] : [])];
  return (
    <div className={`flex gap-1.5 ${compact ? 'flex-wrap' : 'overflow-x-auto pb-1 -mx-0.5 px-0.5'}`}>
      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onChange(n.id)}
          className={`shrink-0 rounded-full border px-3 ${compact ? 'h-7 text-[12px]' : 'h-8 text-[13px]'} font-medium transition-colors ${value === n.id ? 'bg-ink-900 border-ink-900 text-white' : 'bg-surface border-ink-200 text-ink-700 hover:border-ink-300'}`}
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}
