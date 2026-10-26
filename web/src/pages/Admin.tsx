import { useCallback, useEffect, useState } from 'react';
import { Users, Activity, Settings, FolderOpen, UserPlus, RotateCcw, Server, HardDrive } from 'lucide-react';
import { api, timeAgo } from '../api';
import { Modal, Spinner, StatusBadge, useToast } from '../ui';
import { useAuth } from '../main';

type Tab = 'users' | 'system' | 'projects' | 'settings';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const tabs: [Tab, string, any][] = [
    ['users', 'Користувачі', Users],
    ['system', 'Система та черга', Activity],
    ['projects', 'Усі проєкти', FolderOpen],
    ['settings', 'Налаштування', Settings],
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Адмін-панель</h1>
      <div className="flex gap-1 border-b border-ink-200 mb-5">
        {tabs.map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-2 px-4 h-10 text-sm border-b-2 -mb-px ${tab === t ? 'border-ink-900 text-ink-900 font-medium' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[] | null>(null);
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user' });
  const toast = useToast();
  const { user: me } = useAuth();
  const load = useCallback(() => api.get('/api/admin/users').then((r) => setUsers(r.users)), []);
  useEffect(() => {
    load();
  }, [load]);
  const patch = async (id: string, body: any) => {
    try {
      await api.patch(`/api/admin/users/${id}`, body);
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  if (!users) return <Spinner />;
  return (
    <div className="card">
      <div className="p-3 flex justify-between items-center border-b border-ink-200">
        <div className="text-sm text-ink-500">
          {users.length} користувачів
          {users.some((u) => u.status === 'pending') && <span className="chip bg-amber-50 text-amber-700 ml-2">{users.filter((u) => u.status === 'pending').length} очікують підтвердження</span>}
        </div>
        <button className="btn-primary btn-sm" onClick={() => setCreate(true)}>
          <UserPlus className="w-4 h-4" /> Додати користувача
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500 text-xs border-b border-ink-200">
            <th className="p-3">Користувач</th>
            <th className="p-3">Роль</th>
            <th className="p-3">Статус</th>
            <th className="p-3">Проєктів</th>
            <th className="p-3">Останній вхід</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-ink-100">
              <td className="p-3">
                <div className="font-medium">{u.name || '—'}</div>
                <div className="text-xs text-ink-500">{u.email}</div>
              </td>
              <td className="p-3">
                <select className="ed-input w-28" value={u.role} disabled={u.id === me?.id} onChange={(e) => patch(u.id, { role: e.target.value })}>
                  <option value="user">Користувач</option>
                  <option value="admin">Адмін</option>
                </select>
              </td>
              <td className="p-3"><StatusBadge status={u.status} /></td>
              <td className="p-3">{u.projectCount}</td>
              <td className="p-3 text-ink-500">{timeAgo(u.lastLoginAt)}</td>
              <td className="p-3">
                <div className="flex gap-1.5 justify-end">
                  {u.status !== 'active' && <button className="btn-outline btn-sm" onClick={() => patch(u.id, { status: 'active' })}>Активувати</button>}
                  {u.status === 'active' && u.id !== me?.id && <button className="btn-outline btn-sm" onClick={() => patch(u.id, { status: 'blocked' })}>Заблокувати</button>}
                  <button
                    className="btn-outline btn-sm"
                    onClick={async () => {
                      const p = prompt(`Новий пароль для ${u.email} (мін. 8 символів):`);
                      if (!p) return;
                      try {
                        await api.post(`/api/admin/users/${u.id}/password`, { password: p });
                        toast('Пароль змінено');
                      } catch (err) {
                        toast((err as Error).message, 'error');
                      }
                    }}
                  >
                    Пароль
                  </button>
                  {u.id !== me?.id && (
                    <button
                      className="btn-danger btn-sm"
                      onClick={async () => {
                        if (!confirm(`Видалити ${u.email} разом з усіма проєктами?`)) return;
                        await api.del(`/api/admin/users/${u.id}`);
                        load();
                      }}
                    >
                      Видалити
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={create} onClose={() => setCreate(false)} title="Новий користувач" width="max-w-md">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post('/api/admin/users', form);
              setCreate(false);
              setForm({ email: '', name: '', password: '', role: 'user' });
              load();
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        >
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Ім’я</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Пароль</label><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div>
            <label className="label">Роль</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Користувач</option>
              <option value="admin">Адміністратор</option>
            </select>
          </div>
          <button className="btn-primary w-full">Створити</button>
        </form>
      </Modal>
    </div>
  );
}

function fmtBytes(n: number) {
  return n > 1e9 ? `${(n / 1e9).toFixed(1)} ГБ` : `${Math.round(n / 1e6)} МБ`;
}

function SystemTab() {
  const [s, setS] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const load = useCallback(() => {
    api.get('/api/admin/stats').then(setS);
    api.get('/api/health').then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  if (!s) return <Spinner />;
  const c = s.counts;
  const stat = (label: string, v: any) => (
    <div className="card p-4">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{typeof v === 'number' ? v.toLocaleString('uk-UA') : v}</div>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {stat('Користувачі', c.users)}
        {stat('Проєкти', c.projects)}
        {stat('Фіди', c.feeds)}
        {stat('Дизайни', c.designs)}
        {stat('Товари', c.products)}
        {stat('Фіди з помилкою', c.feedErrors)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="font-semibold mb-3 flex items-center gap-2"><Server className="w-4 h-4" /> Стан сервісу</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">API / база даних</span>{health?.ok ? <span className="chip bg-emerald-50 text-emerald-700">OK</span> : <span className="chip bg-red-50 text-red-700">Недоступно</span>}</div>
            <div className="flex justify-between"><span className="text-ink-500">Активних воркерів</span><b>{health?.workers ?? '—'}</b></div>
            {s.workers.map((w: any) => (
              <div key={w.id} className="flex justify-between text-xs text-ink-500 pl-3"><span className="font-mono">{w.id}</span><span>{timeAgo(w.at)} · задач: {w.running}</span></div>
            ))}
            {s.disk && (
              <div className="flex justify-between items-center"><span className="text-ink-500 flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Диск</span><span>вільно {fmtBytes(s.disk.free)} з {fmtBytes(s.disk.total)}</span></div>
            )}
          </div>
        </div>
        <div className="card p-4">
          <div className="font-semibold mb-3">Черга задач (24 год)</div>
          <table className="w-full text-sm">
            <tbody>
              {s.queue.map((q: any, i: number) => (
                <tr key={i} className="border-b border-ink-100">
                  <td className="py-1.5">{q.type === 'sync-feed' ? 'Оновлення фіду' : 'Рендер дизайну'}</td>
                  <td className="py-1.5"><StatusBadge status={q.status === 'done' ? 'ok' : q.status === 'failed' ? 'error' : q.status} /></td>
                  <td className="py-1.5 text-right font-medium">{q.count}</td>
                </tr>
              ))}
              {!s.queue.length && <tr><td className="text-ink-500 text-sm">Порожньо</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="p-4 font-semibold">Фіди з помилками</div>
        <table className="w-full text-sm">
          <tbody>
            {s.feedErrors.map((f: any) => (
              <tr key={f.id} className="border-t border-ink-100">
                <td className="p-3"><a className="text-brand-600" href={`/feeds/${f.id}`}>{f.name}</a><div className="text-xs text-ink-500">{f.projectName}</div></td>
                <td className="p-3 text-red-600 text-xs">{f.lastError}</td>
                <td className="p-3 text-ink-500 text-xs">{timeAgo(f.lastSyncAt)}</td>
              </tr>
            ))}
            {!s.feedErrors.length && <tr><td className="p-3 text-ink-500">Помилок немає 🎉</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="p-4 font-semibold">Невдалі задачі</div>
        <table className="w-full text-sm">
          <tbody>
            {s.failures.map((j: any) => (
              <tr key={j.id} className="border-t border-ink-100">
                <td className="p-3 font-mono text-xs">#{j.id} {j.type}</td>
                <td className="p-3 text-red-600 text-xs">{j.lastError}</td>
                <td className="p-3 text-ink-500 text-xs">{timeAgo(j.finishedAt)}</td>
                <td className="p-3 text-right">
                  <button className="btn-outline btn-sm" onClick={async () => { await api.post(`/api/admin/jobs/${j.id}/retry`); load(); }}>
                    <RotateCcw className="w-3.5 h-3.5" /> Повторити
                  </button>
                </td>
              </tr>
            ))}
            {!s.failures.length && <tr><td className="p-3 text-ink-500">Немає</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTab() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    api.get('/api/admin/projects').then((r) => setRows(r.projects));
  }, []);
  if (!rows) return <Spinner />;
  return (
    <div className="card">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500 text-xs border-b border-ink-200">
            <th className="p-3">Проєкт</th><th className="p-3">Власник</th><th className="p-3">Фідів</th><th className="p-3">Товарів</th><th className="p-3">Створено</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-ink-100">
              <td className="p-3"><a className="text-brand-600 font-medium" href={`/projects/${p.id}`}>{p.name}</a></td>
              <td className="p-3">{p.ownerEmail}</td>
              <td className="p-3">{p.feedCount}</td>
              <td className="p-3">{p.productCount.toLocaleString('uk-UA')}</td>
              <td className="p-3 text-ink-500">{new Date(p.createdAt).toLocaleDateString('uk-UA')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab() {
  const [mode, setMode] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    api.get('/api/admin/settings').then((r) => setMode(r.registrationMode));
  }, []);
  if (!mode) return <Spinner />;
  const opts: [string, string, string][] = [
    ['open', 'Відкрита', 'Будь-хто може зареєструватися й одразу працювати'],
    ['approval', 'З підтвердженням', 'Нові акаунти чекають активації адміністратором (рекомендовано)'],
    ['closed', 'Закрита', 'Реєстрація вимкнена, користувачів додає лише адміністратор'],
  ];
  return (
    <div className="card p-5 max-w-xl">
      <div className="font-semibold mb-3">Реєстрація нових користувачів</div>
      <div className="space-y-2">
        {opts.map(([v, l, d]) => (
          <label key={v} className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${mode === v ? 'border-ink-900' : 'border-ink-200'}`}>
            <input
              type="radio"
              checked={mode === v}
              onChange={async () => {
                setMode(v);
                await api.put('/api/admin/settings', { registrationMode: v });
                toast('Збережено');
              }}
            />
            <div>
              <div className="text-sm font-medium">{l}</div>
              <div className="text-xs text-ink-500">{d}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
