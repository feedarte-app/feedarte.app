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
      <h1 className="text-[28px] font-semibold tracking-tight mb-6">Адмін-панель</h1>
      <div className="inline-flex gap-1 p-1 rounded-full bg-surface border border-ink-200/70 shadow-card mb-6">
        {tabs.map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-2 px-4 h-9 rounded-full text-sm transition-all ${tab === t ? 'bg-ink-900 text-white font-medium shadow-sm' : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100'}`}>
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


function AccessCell({ u, onChange }: { u: any; onChange: () => void }) {
  const toast = useToast();
  if (u.role === 'admin' || u.status === 'pending') return <span className="text-ink-400 text-xs">—</span>;
  const until = u.accessUntil ? new Date(u.accessUntil) : null;
  const left = until ? Math.ceil((until.getTime() - Date.now()) / 86400000) : null;
  const label = !until
    ? <span className="chip bg-ink-100 text-ink-600">Без обмежень</span>
    : left! <= 0
      ? <span className="chip bg-red-50 text-red-700">Заморожено з {until.toLocaleDateString('uk-UA')}</span>
      : <span className={`chip ${left! <= 3 ? 'bg-amber-50 text-amber-700' : u.plan === 'trial' ? 'bg-brand-50 text-brand-700' : 'bg-emerald-50 text-emerald-700'}`}>{u.plan === 'trial' ? 'Тріал' : 'Оплачено'} до {until.toLocaleDateString('uk-UA')} · {left} дн.</span>;
  const act = async (body: any) => {
    try {
      await api.post(`/api/admin/users/${u.id}/access`, body);
      toast('Доступ оновлено');
      onChange();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {label}
      <select
        className="ed-input !h-7 !w-auto !text-xs !px-2 pr-7"
        value=""
        data-testid="access-select"
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = '';
          if (v === 'trial') act({ action: 'trial' });
          else if (v === 'm1') act({ action: 'extend', days: 30 });
          else if (v === 'm3') act({ action: 'extend', days: 90 });
          else if (v === 'm12') act({ action: 'extend', days: 365 });
          else if (v === 'date') {
            const d = prompt('Доступ до дати (РРРР-ММ-ДД):', until ? until.toISOString().slice(0, 10) : '');
            if (d) act({ action: 'until', until: d });
          } else if (v === 'unlimited') act({ action: 'unlimited' });
        }}
      >
        <option value="">Змінити…</option>
        <option value="trial">Почати тріал з сьогодні</option>
        <option value="m1">Оплата: +1 місяць</option>
        <option value="m3">Оплата: +3 місяці</option>
        <option value="m12">Оплата: +12 місяців</option>
        <option value="date">До дати…</option>
        <option value="unlimited">Без обмежень</option>
      </select>
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
  const access = async (id: string, body: any) => {
    try {
      await api.post(`/api/admin/users/${id}/access`, body);
      toast('Доступ оновлено');
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  if (!users) return <Spinner />;
  return (
    <div className="card overflow-hidden">
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
            <th className="p-3">Доступ</th>
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
              <td className="p-3"><AccessCell u={u} onChange={load} /></td>
              <td className="p-3">{u.projectCount}</td>
              <td className="p-3 text-ink-500">{timeAgo(u.lastLoginAt)}</td>
              <td className="p-3">
                <div className="flex gap-1.5 justify-end">
                  {u.status === 'pending' && u.role !== 'admin' && (
                    <button className="btn-primary btn-sm" data-testid="start-trial" onClick={() => access(u.id, { action: 'trial' })}>Почати тріал</button>
                  )}
                  {u.status !== 'active' && <button className="btn-outline btn-sm" onClick={() => patch(u.id, { status: 'active' })}>{u.status === 'pending' ? 'Без обмежень' : 'Активувати'}</button>}
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
    <div className="island p-5">
      <div className="eyebrow">{label}</div>
      <div className="text-[26px] font-semibold tracking-tight mt-1.5">{typeof v === 'number' ? v.toLocaleString('uk-UA') : v}</div>
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
      <div className="card overflow-hidden">
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
      <div className="card overflow-hidden">
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
    <div className="card overflow-hidden">
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

function SecretField({ label, hint, current, field, placeholder, onSaved }: { label: string; hint: React.ReactNode; current: string; field: string; placeholder: string; onSaved: () => void }) {
  const [v, setV] = useState('');
  const toast = useToast();
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="label !mb-0">{label}</label>
        {current ? <span className="chip bg-emerald-50 text-emerald-700">Підключено · {current}</span> : <span className="chip bg-ink-100 text-ink-500">Не підключено</span>}
      </div>
      <div className="flex gap-2">
        <input className="input font-mono text-xs" type="password" autoComplete="off" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
        <button
          className="btn-primary"
          disabled={!v.trim()}
          onClick={async () => {
            await api.put('/api/admin/settings', { [field]: v.trim() });
            setV('');
            toast('Збережено');
            onSaved();
          }}
        >
          Зберегти
        </button>
        {current && (
          <button
            className="btn-outline"
            onClick={async () => {
              await api.put('/api/admin/settings', { [field]: '' });
              onSaved();
            }}
          >
            Вимкнути
          </button>
        )}
      </div>
      <p className="text-xs text-ink-500 mt-1.5 leading-relaxed">{hint}</p>
    </div>
  );
}

function MailSettings() {
  const [m, setM] = useState<any>(null);
  const [secret, setSecret] = useState({ resendKey: '', smtpPass: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const load = () => api.get('/api/admin/settings').then((r) => setM(r.mail));
  useEffect(() => {
    load();
  }, []);
  if (!m) return <Spinner />;
  const set = (k: string, v: any) => setM({ ...m, [k]: v });
  const save = async () => {
    setBusy('save');
    try {
      await api.put('/api/admin/mail', { provider: m.provider, from: m.from, smtpHost: m.smtpHost, smtpPort: m.smtpPort, smtpUser: m.smtpUser, ...secret });
      setSecret({ resendKey: '', smtpPass: '' });
      toast('Збережено');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="island p-6 space-y-4">
      <div>
        <div className="font-semibold text-[17px] tracking-tight">Пошта</div>
        <p className="text-sm text-ink-500 mt-1">Для листів-підтверджень (наприклад, передача проєкту іншому акаунту).</p>
      </div>
      <div className="seg w-full">
        {[['none', 'Вимкнено'], ['resend', 'Resend'], ['smtp', 'SMTP']].map(([v, l]) => (
          <button key={v} type="button" data-on={m.provider === v} onClick={() => set('provider', v)}>{l}</button>
        ))}
      </div>
      {m.provider !== 'none' && (
        <div>
          <label className="label">Від кого</label>
          <input className="input" placeholder="Feedarte <no-reply@feedarte.com>" value={m.from} onChange={(e) => set('from', e.target.value)} />
        </div>
      )}
      {m.provider === 'resend' && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label !mb-0">Resend API key</label>
            {m.resendKey ? <span className="chip bg-emerald-50 text-emerald-700">Збережено · {m.resendKey}</span> : <span className="chip bg-ink-100 text-ink-500">Немає</span>}
          </div>
          <input className="input font-mono text-xs" type="password" autoComplete="off" placeholder="re_…" value={secret.resendKey} onChange={(e) => setSecret({ ...secret, resendKey: e.target.value })} />
          <p className="text-xs text-ink-500 mt-1.5 leading-relaxed">
            resend.com → <b>Domains → Add domain</b> (feedarte.com, додайте показані DNS-записи в Cloudflare) → <b>API Keys → Create</b>. Безкоштовно до 3000 листів на місяць.
          </p>
        </div>
      )}
      {m.provider === 'smtp' && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><label className="label">Сервер</label><input className="input" placeholder="smtp-relay.brevo.com" value={m.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} /></div>
          <div><label className="label">Порт</label><input className="input" type="number" value={m.smtpPort} onChange={(e) => set('smtpPort', Number(e.target.value))} /></div>
          <div className="col-span-3"><label className="label">Логін</label><input className="input" value={m.smtpUser} onChange={(e) => set('smtpUser', e.target.value)} /></div>
          <div className="col-span-3">
            <label className="label">Пароль {m.smtpPass && <span className="text-ink-400 font-normal">(збережено — залиште порожнім, щоб не змінювати)</span>}</label>
            <input className="input" type="password" autoComplete="off" value={secret.smtpPass} onChange={(e) => setSecret({ ...secret, smtpPass: e.target.value })} />
          </div>
          <p className="col-span-3 text-xs text-ink-500">Порти 25 і 465 на нових серверах Hetzner часто заблоковані — використовуйте 587 або Resend.</p>
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!!busy} onClick={save}>{busy === 'save' && <Spinner />} Зберегти</button>
        {m.provider !== 'none' && (
          <button
            className="btn-outline"
            disabled={!!busy}
            onClick={async () => {
              setBusy('test');
              try {
                const r = await api.post('/api/admin/mail/test', {});
                toast(`Тестовий лист надіслано на ${r.to}`);
              } catch (e) {
                toast((e as Error).message, 'error');
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === 'test' && <Spinner />} Надіслати тест собі
          </button>
        )}
      </div>
    </div>
  );
}


function TelegramSettings() {
  const [t, setT] = useState<any>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const load = () => api.get('/api/admin/settings').then((r) => setT(r.telegram));
  useEffect(() => {
    load();
  }, []);
  if (!t) return <Spinner />;
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const connected = t.hasToken && t.chatId;
  return (
    <div className="island p-6 space-y-4" data-testid="tg-settings">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[17px] tracking-tight">Telegram-сповіщення</div>
          <p className="text-sm text-ink-500 mt-1">Бот пише вам про реєстрації, нові фіди й збої сервісу.</p>
        </div>
        {connected ? <span className="chip bg-emerald-50 text-emerald-700 shrink-0">Підключено</span> : <span className="chip bg-ink-100 text-ink-500 shrink-0">Не підключено</span>}
      </div>

      {!connected && (
        <ol className="text-sm text-ink-600 space-y-1.5 list-decimal pl-5">
          <li>У Telegram відкрийте <a className="text-brand-600 hover:underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> → <b>/newbot</b> → придумайте назву. Скопіюйте токен.</li>
          <li>Вставте токен нижче і збережіть.</li>
          <li>Відкрийте свого бота, натисніть <b>Start</b>, потім — «Знайти мій чат».</li>
        </ol>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label !mb-0">Токен бота</label>
          {t.hasToken && <span className="chip bg-ink-100 text-ink-500">Збережено · {t.token}</span>}
        </div>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" type="password" autoComplete="off" placeholder="123456789:AAH…" value={token} onChange={(e) => setToken(e.target.value)} data-testid="tg-token" />
          <button
            className="btn-outline shrink-0"
            disabled={!token || !!busy}
            onClick={() =>
              run('token', async () => {
                await api.put('/api/admin/telegram', { token });
                setToken('');
                toast('Токен збережено');
                await load();
              })
            }
          >
            {busy === 'token' && <Spinner />} Зберегти
          </button>
        </div>
      </div>

      {t.hasToken && !t.chatId && (
        <button
          className="btn-primary w-full"
          disabled={!!busy}
          data-testid="tg-detect"
          onClick={() =>
            run('detect', async () => {
              const r = await api.post('/api/admin/telegram/detect', {});
              toast(`Підключено: ${r.chatTitle}`);
              await load();
            })
          }
        >
          {busy === 'detect' && <Spinner />} Знайти мій чат
        </button>
      )}

      {connected && (
        <>
          <div className="text-sm text-ink-600">Чат: <b className="text-ink-900">{t.chatTitle || t.chatId}</b></div>
          <div>
            <div className="label">Про що повідомляти</div>
            <div className="grid gap-1">
              {Object.entries(t.eventLabels as Record<string, string>).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2.5 text-sm py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!t.events[k]}
                    onChange={async (e) => {
                      const v = e.target.checked;
                      setT({ ...t, events: { ...t.events, [k]: v } });
                      try {
                        await api.put('/api/admin/telegram', { events: { [k]: v } });
                      } catch (err) {
                        toast((err as Error).message, 'error');
                        load();
                      }
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-ink-500 mt-1.5">Ваші власні дії як адміністратора не надсилаються. Помилки одного фіду чи дизайну — не частіше разу на 12 годин.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" disabled={!!busy} onClick={() => run('test', async () => { await api.post('/api/admin/telegram/test', {}); toast('Надіслано — перевірте Telegram'); })}>
              {busy === 'test' && <Spinner />} Надіслати тест
            </button>
            <button
              className="btn-ghost"
              disabled={!!busy}
              onClick={() =>
                run('off', async () => {
                  if (!confirm('Відключити Telegram-сповіщення?')) return;
                  await api.del('/api/admin/telegram');
                  await load();
                })
              }
            >
              Відключити
            </button>
          </div>
        </>
      )}
    </div>
  );
}


function AccessSettings() {
  const [v, setV] = useState<{ contactTelegram: string; trialDays: number } | null>(null);
  const toast = useToast();
  useEffect(() => {
    api.get('/api/admin/settings').then((r) => setV({ contactTelegram: r.contactTelegram, trialDays: r.trialDays }));
  }, []);
  if (!v) return null;
  return (
    <div className="grid grid-cols-[1fr_110px_auto] gap-2 items-end mb-4" data-testid="access-settings">
      <div>
        <label className="label">Ваш Telegram для заявок</label>
        <input className="input" placeholder="@feedarte" value={v.contactTelegram ? '@' + v.contactTelegram.replace(/^@/, '') : ''} onChange={(e) => setV({ ...v, contactTelegram: e.target.value.replace(/^@/, '') })} />
      </div>
      <div>
        <label className="label">Тріал, днів</label>
        <input className="input" type="number" min={1} max={90} value={v.trialDays} onChange={(e) => setV({ ...v, trialDays: Number(e.target.value) })} />
      </div>
      <button
        className="btn-outline"
        onClick={async () => {
          try {
            await api.put('/api/admin/settings', v);
            toast('Збережено');
          } catch (e) {
            toast((e as Error).message, 'error');
          }
        }}
      >
        Зберегти
      </button>
      <p className="col-span-3 text-xs text-ink-500 -mt-1">Після реєстрації людина бачить кнопку «Написати в Telegram» з готовим повідомленням. Ви натискаєте «Почати тріал» у списку користувачів.</p>
    </div>
  );
}

function SettingsTab() {
  const [mode, setMode] = useState<string | null>(null);
  const [keys, setKeys] = useState<{ figmaToken: string; anthropicKey: string }>({ figmaToken: '', anthropicKey: '' });
  const toast = useToast();
  const load = () =>
    api.get('/api/admin/settings').then((r) => {
      setMode(r.registrationMode);
      setKeys({ figmaToken: r.figmaToken, anthropicKey: r.anthropicKey });
    });
  useEffect(() => {
    load();
  }, []);
  if (!mode) return <Spinner />;
  const opts: [string, string, string][] = [
    ['open', 'Відкрита', 'Будь-хто реєструється і одразу отримує тріал'],
    ['approval', 'Через Telegram', 'Людина реєструється і пише вам у Telegram, ви натискаєте «Почати тріал» (рекомендовано)'],
    ['closed', 'Закрита', 'Реєстрація вимкнена, користувачів додає лише адміністратор'],
  ];
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
    <div className="island p-6 space-y-5">
      <div>
        <div className="font-semibold text-[17px] tracking-tight">Інтеграції для імпорту дизайнів</div>
        <p className="text-sm text-ink-500 mt-1">Ключі зберігаються на сервері й не показуються повністю.</p>
      </div>
      <SecretField
        label="Figma — Personal access token"
        field="figmaToken"
        current={keys.figmaToken}
        placeholder="figd_…"
        onSaved={load}
        hint={<>Figma → аватар → <b>Settings → Security → Personal access tokens → Generate new token</b>. Права: <i>File content — Read only</i>. Файли мають бути доступні цьому акаунту Figma.</>}
      />
      <SecretField
        label="Anthropic API key — розпізнавання PNG/JPG макетів"
        field="anthropicKey"
        current={keys.anthropicKey}
        placeholder="sk-ant-…"
        onSaved={load}
        hint={<>console.anthropic.com → <b>API Keys → Create Key</b>. Один імпорт картинки коштує приблизно $0.01–0.05.</>}
      />
    </div>
    <div className="space-y-4">
    <div className="island p-6">
      <div className="font-semibold mb-3">Реєстрація нових користувачів</div>
      <AccessSettings />
      <div className="space-y-2">
        {opts.map(([v, l, d]) => (
          <label key={v} className={`flex gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${mode === v ? 'border-brand-400 ring-4 ring-brand-100 bg-brand-50/40' : 'border-ink-200 hover:border-ink-300'}`}>
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
    <TelegramSettings />
    <MailSettings />
    </div>
    </div>
  );
}
