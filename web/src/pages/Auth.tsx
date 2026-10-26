import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../main';
import { Spinner } from '../ui';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [regMode, setRegMode] = useState<string>('open');

  useEffect(() => {
    api.get('/api/auth/config').then((c) => setRegMode(c.registrationMode));
  }, []);
  useEffect(() => {
    if (user) nav(sp.get('next') || '/', { replace: true });
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.post(`/api/auth/${mode}`, mode === 'register' ? { email, password, name } : { email, password });
      if (r.pending) setInfo('Дякуємо! Обліковий запис створено й очікує підтвердження адміністратором.');
      else setUser(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(255,138,61,.28),transparent)]" />
      <div className="w-full max-w-sm relative animate-pop-in">
        <div className="flex items-center gap-2.5 justify-center mb-7">
          <img src="/favicon.svg" className="w-10 h-10 drop-shadow-[0_6px_14px_rgba(255,107,26,.4)]" alt="" />
          <span className="text-2xl font-semibold tracking-tight">Feedarte</span>
        </div>
        <div className="island p-7 shadow-lift">
          <h1 className="text-xl font-semibold tracking-tight mb-1">{mode === 'login' ? 'Вхід' : 'Реєстрація'}</h1>
          <p className="text-sm text-ink-500 mb-5">Динамічні креативи для каталогів Meta та TikTok</p>
          {info ? (
            <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm p-3">{info}</div>
          ) : mode === 'register' && regMode === 'closed' ? (
            <div className="rounded-lg bg-amber-50 text-amber-800 text-sm p-3">Реєстрацію закрито. Зверніться до адміністратора, щоб отримати доступ.</div>
          ) : (
            <form className="space-y-3" onSubmit={submit}>
              {mode === 'register' && (
                <div>
                  <label className="label">Ім’я</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
              )}
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div>
                <label className="label">Пароль</label>
                <input
                  className="input"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
              {mode === 'register' && regMode === 'approval' && (
                <div className="text-xs text-ink-500">Після реєстрації адміністратор має підтвердити доступ.</div>
              )}
              <button className="btn-primary w-full" disabled={busy}>
                {busy && <Spinner />}
                {mode === 'login' ? 'Увійти' : 'Створити акаунт'}
              </button>
            </form>
          )}
        </div>
        <div className="text-center text-sm text-ink-500 mt-4">
          {mode === 'login' ? (
            regMode !== 'closed' && (
              <>
                Немає акаунта? <Link to="/register" className="text-brand-600 font-medium">Зареєструватися</Link>
              </>
            )
          ) : (
            <>
              Вже є акаунт? <Link to="/login" className="text-brand-600 font-medium">Увійти</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
