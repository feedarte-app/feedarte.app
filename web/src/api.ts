export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined || method !== 'GET') {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('fc:unauthorized'));
    throw new ApiError(res.status, data.error ?? `Помилка ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T = any>(u: string) => req<T>('GET', u),
  post: <T = any>(u: string, b?: unknown) => req<T>('POST', u, b),
  put: <T = any>(u: string, b?: unknown) => req<T>('PUT', u, b),
  patch: <T = any>(u: string, b?: unknown) => req<T>('PATCH', u, b),
  del: <T = any>(u: string) => req<T>('DELETE', u),
};

export function imgProxy(url: string): string {
  if (url.startsWith('/')) return url;
  return `/api/img?url=${encodeURIComponent(url)}`;
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'щойно';
  if (s < 3600) return `${Math.floor(s / 60)} хв тому`;
  if (s < 86400) return `${Math.floor(s / 3600)} год тому`;
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
