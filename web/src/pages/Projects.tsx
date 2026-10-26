import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderPlus, Folder, Rss, Palette, Package, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { Empty, Modal, Spinner, useToast } from '../ui';
import { useAuth } from '../main';

type P = { id: string; name: string; feedCount: number; designCount: number; productCount: number; errorCount: number; ownerEmail: string; ownerId: string };

export function ProjectsPage() {
  const [items, setItems] = useState<P[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const toast = useToast();
  const nav = useNavigate();
  const { user } = useAuth();
  useEffect(() => {
    api.get('/api/projects').then((r) => setItems(r.projects));
  }, []);
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Проєкти</h1>
          <p className="text-sm text-ink-500 mt-1">Проєкт → фіди товарів → дизайни креативів → вихідні фіди для реклами</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          <FolderPlus className="w-4 h-4" /> Новий проєкт
        </button>
      </div>
      {!items ? (
        <Spinner className="w-5 h-5 text-ink-400" />
      ) : items.length === 0 ? (
        <Empty
          icon={<Folder className="w-5 h-5" />}
          title="Поки немає проєктів"
          text="Створіть проєкт для магазину або клієнта, додайте XML-фід і зберіть перший дизайн."
          action={<button className="btn-primary" onClick={() => setOpen(true)}>Створити проєкт</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card p-5 hover:border-ink-300 transition">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-semibold">{p.name.slice(0, 1).toUpperCase()}</div>
                {p.errorCount > 0 && (
                  <span className="chip bg-red-50 text-red-700">
                    <AlertTriangle className="w-3 h-3" /> {p.errorCount}
                  </span>
                )}
              </div>
              <div className="font-semibold mt-3">{p.name}</div>
              {user?.role === 'admin' && p.ownerId !== user.id && <div className="text-xs text-ink-400 mt-0.5">{p.ownerEmail}</div>}
              <div className="flex gap-4 mt-4 text-[13px] text-ink-500">
                <span className="flex items-center gap-1"><Rss className="w-3.5 h-3.5" /> {p.feedCount} фідів</span>
                <span className="flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> {p.designCount} дизайнів</span>
                <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {p.productCount.toLocaleString('uk-UA')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Новий проєкт" width="max-w-md">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await api.post('/api/projects', { name });
              nav(`/projects/${r.project.id}`);
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        >
          <div>
            <label className="label">Назва проєкту</label>
            <input className="input" autoFocus placeholder="Напр. USMALL" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={!name.trim()}>Створити</button>
        </form>
      </Modal>
    </div>
  );
}
