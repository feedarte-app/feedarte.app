// Public contact settings (admin → Налаштування): Telegram handle for access requests, trial length.
import { useEffect, useState } from 'react';
import { api } from './api';

export type Contact = { telegram: string; trialDays: number };
let cached: Promise<Contact> | null = null;
export function loadContact(): Promise<Contact> {
  cached ??= api
    .get('/api/auth/config')
    .then((c) => ({ telegram: c.contactTelegram || '', trialDays: c.trialDays || 14 }))
    .catch(() => ({ telegram: '', trialDays: 14 }));
  return cached;
}
export function useContact(): Contact | null {
  const [c, setC] = useState<Contact | null>(null);
  useEffect(() => {
    loadContact().then(setC);
  }, []);
  return c;
}
/** t.me link with a prefilled message (supported by Telegram apps for user links) */
export const tgLink = (handle: string, text: string) => `https://t.me/${handle}?text=${encodeURIComponent(text)}`;
