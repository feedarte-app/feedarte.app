// Light / dark theme. Stored in localStorage and in a cookie on .feedarte.com,
// so the landing (feedarte.com) and the app (app.feedarte.com) share the choice.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function setTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try { localStorage.setItem('fa_theme', t); } catch { /* private mode */ }
  const domain = location.hostname.endsWith('feedarte.com') ? '; domain=.feedarte.com' : '';
  document.cookie = `fa_theme=${t}; path=/; max-age=31536000; samesite=lax${domain}`;
  window.dispatchEvent(new CustomEvent('fa:theme', { detail: t }));
}

export function useTheme(): [Theme, () => void] {
  const [t, setT] = useState<Theme>(getTheme);
  useEffect(() => {
    const h = () => setT(getTheme());
    window.addEventListener('fa:theme', h);
    return () => window.removeEventListener('fa:theme', h);
  }, []);
  return [t, () => setTheme(t === 'dark' ? 'light' : 'dark')];
}
