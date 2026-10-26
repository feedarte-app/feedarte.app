import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Search, Check, ImageOff } from 'lucide-react';
import { api } from '../api';
import { Modal, Spinner, useToast } from '../ui';

type Row = { value: string; key: string; count: number; url: string | null };

export function LogoLibrary({ open, onClose, projectId, field, onChanged }: { open: boolean; onClose: () => void; projectId: string; field: string; onChanged: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ matched: { file: string; value: string }[]; unmatched: string[] } | null>(null);
  const bulk = useRef<HTMLInputElement>(null);
  const single = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const toast = useToast();

  const load = () => api.get(`/api/projects/${projectId}/logos?field=${encodeURIComponent(field)}`).then((r) => setRows(r.rows));
  useEffect(() => {
    if (open) {
      setReport(null);
      load();
    }
  }, [open, field]);

  const upload = async (files: File[], value?: string) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('field', field);
      if (value) fd.append('value', value);
      for (const f of files) fd.append('file', f);
      const r = await api.post(`/api/projects/${projectId}/logos`, fd);
      if (!value) setReport(r);
      else toast('Логотип збережено');
      await load();
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const list = (rows ?? []).filter((r) => (!onlyMissing || !r.url) && (!q || r.value.toLowerCase().includes(q.toLowerCase())));
  const missing = (rows ?? []).filter((r) => !r.url && r.count > 0).length;
  const withLogo = (rows ?? []).filter((r) => r.url).length;

  return (
    <Modal open={open} onClose={onClose} title="Бібліотека логотипів брендів" width="max-w-3xl">
      <div className="space-y-4">
        <div
          className="rounded-3xl border-2 border-dashed border-ink-200 hover:border-brand-300 hover:bg-brand-50/30 transition-all p-5 flex items-center gap-4 cursor-pointer"
          onClick={() => bulk.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload([...(e.dataTransfer.files ?? [])]);
          }}
        >
          <div className="w-12 h-12 rounded-2xl bg-white shadow-card flex items-center justify-center text-brand-600 shrink-0">{busy ? <Spinner className="w-5 h-5" /> : <Upload className="w-5 h-5" />}</div>
          <div>
            <div className="font-medium text-sm">Перетягніть усі логотипи разом — ми самі розкладемо їх по брендах</div>
            <div className="text-xs text-ink-500 mt-0.5">
              Назва файлу = назва бренду: <code>tommy-hilfiger.png</code>, <code>Calvin Klein logo.svg</code>. PNG з прозорим фоном або SVG — найкраще.
            </div>
          </div>
          <input ref={bulk} type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </div>

        {report && (
          <div className="rounded-2xl bg-ink-50 border border-ink-200 p-3 text-sm animate-fade-in">
            <div className="flex items-center gap-2 font-medium"><Check className="w-4 h-4 text-emerald-600" /> Розпізнано: {report.matched.length}</div>
            {report.unmatched.length > 0 && (
              <div className="mt-1 text-amber-700 text-xs">
                Не вдалося зіставити з брендами фіду ({report.unmatched.length}): {report.unmatched.join(', ')}. Завантажте їх кнопкою біля потрібного бренду нижче.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-ink-400" />
            <input className="input pl-10" placeholder="Пошук бренду" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            Лише без логотипа {missing > 0 && <span className="chip bg-amber-50 text-amber-700">{missing}</span>}
          </label>
        </div>
        <div className="text-xs text-ink-500">Брендів у фідах: {rows?.filter((r) => r.count > 0).length ?? '…'} · з логотипом: {withLogo}</div>

        <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1 divide-y divide-ink-100">
          {!rows && <div className="py-6 flex justify-center"><Spinner /></div>}
          {rows && !list.length && <div className="py-6 text-sm text-ink-500 text-center">Нічого не знайдено</div>}
          {list.map((r) => (
            <div key={r.key} className="flex items-center gap-3 py-2.5">
              <div className="w-24 h-12 rounded-xl bg-[repeating-conic-gradient(#f3f3f5_0_25%,#fff_0_50%)] bg-[length:12px_12px] border border-ink-200 flex items-center justify-center overflow-hidden shrink-0">
                {r.url ? <img src={r.url} className="max-w-full max-h-full object-contain p-1" alt="" /> : <ImageOff className="w-4 h-4 text-ink-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.value}</div>
                <div className="text-xs text-ink-500">{r.count > 0 ? `${r.count.toLocaleString('uk-UA')} товарів` : 'немає у фідах'}</div>
              </div>
              <button className="btn-outline btn-sm" onClick={() => { setTarget(r.value); single.current?.click(); }}>
                <Upload className="w-3.5 h-3.5" /> {r.url ? 'Замінити' : 'Завантажити'}
              </button>
              {r.url && (
                <button
                  className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:text-red-600 hover:bg-red-50 transition"
                  title="Видалити логотип"
                  onClick={async () => {
                    await api.del(`/api/projects/${projectId}/logos?field=${encodeURIComponent(field)}&key=${encodeURIComponent(r.key)}`);
                    await load();
                    onChanged();
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <input
          ref={single}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && target) upload([f], target);
            e.target.value = '';
          }}
        />
        <p className="text-xs text-ink-500">Після змін усі опубліковані дизайни проєкту перегенеруються автоматично — лише товари, яких це стосується.</p>
      </div>
    </Modal>
  );
}
