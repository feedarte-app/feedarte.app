import { StrictMode, createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, LogOut, Shield, KeyRound } from 'lucide-react';
import './index.css';
import { api } from './api';
import { Spinner, ToastProvider, Modal, useToast } from './ui';
import { AuthPage } from './pages/Auth';
import { ProjectsPage } from './pages/Projects';
import { ProjectPage } from './pages/Project';
import { FeedPage } from './pages/Feed';
import { AdminPage } from './pages/Admin';
import { EditorPage } from './editor/Editor';

export type User = { id: string; email: string; name: string; role: 'admin' | 'user' };
const AuthCtx = createContext<{ user: User | null; setUser: (u: User | null) => void }>({ user: null, setUser: () => {} });
export const useAuth = () => useContext(AuthCtx);

function Shell({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [pw, setPw] = useState(false);
  const link = (to: string, label: string, icon: ReactNode) => (
    <Link to={to} className={`flex items-center gap-2 px-3 h-9 rounded-lg text-sm ${loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to)) ? 'bg-ink-100 text-ink-900 font-medium' : 'text-ink-500 hover:text-ink-900'}`}>
      {icon}
      {label}
    </Link>
  );
  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-ink-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" className="w-7 h-7" alt="" />
            FeedCraft
          </Link>
          <nav className="flex gap-1">
            {link('/', 'Проєкти', <LayoutGrid className="w-4 h-4" />)}
            {user?.role === 'admin' && link('/admin', 'Адмін-панель', <Shield className="w-4 h-4" />)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-ink-500 hidden sm:block">{user?.email}</span>
            <button className="btn-ghost btn-sm" title="Змінити пароль" onClick={() => setPw(true)}>
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              className="btn-ghost btn-sm"
              title="Вийти"
              onClick={async () => {
                await api.post('/api/auth/logout');
                setUser(null);
                nav('/login');
              }}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>
      <PasswordModal open={pw} onClose={() => setPw(false)} />
    </div>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Змінити пароль" width="max-w-sm">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post('/api/auth/password', { current: cur, next });
            toast('Пароль змінено');
            onClose();
          } catch (err) {
            toast((err as Error).message, 'error');
          }
        }}
      >
        <div>
          <label className="label">Поточний пароль</label>
          <input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div>
          <label className="label">Новий пароль</label>
          <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <button className="btn-primary w-full">Зберегти</button>
      </form>
    </Modal>
  );
}

function Protected({ children, admin, bare }: { children: ReactNode; admin?: boolean; bare?: boolean }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return bare ? <>{children}</> : <Shell>{children}</Shell>;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api
      .get('/api/auth/me')
      .then((r) => setUser(r.user))
      .finally(() => setReady(true));
    const h = () => setUser(null);
    window.addEventListener('fc:unauthorized', h);
    return () => window.removeEventListener('fc:unauthorized', h);
  }, []);
  if (!ready)
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner className="w-6 h-6 text-ink-400" />
      </div>
    );
  return (
    <AuthCtx.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/" element={<Protected><ProjectsPage /></Protected>} />
          <Route path="/projects/:id" element={<Protected><ProjectPage /></Protected>} />
          <Route path="/feeds/:id" element={<Protected><FeedPage /></Protected>} />
          <Route path="/designs/:id" element={<Protected bare><EditorPage /></Protected>} />
          <Route path="/admin" element={<Protected admin><AdminPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
