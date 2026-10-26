// Outbound HTTP with SSRF protection, timeouts and size limits.
import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from './env';

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const l = ip.toLowerCase();
  if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7));
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Некоректний URL');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Підтримуються лише http/https URL');
  if (env.allowPrivateUrls) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error('Адреса недоступна (внутрішня мережа)');
  return u;
}

export const UA = 'Mozilla/5.0 (compatible; FeedCraftBot/1.0; +https://feedcraft.app)';

export async function safeFetch(
  raw: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; maxRedirects?: number } = {},
): Promise<Response> {
  let url = raw;
  for (let i = 0; i <= (opts.maxRedirects ?? 5); i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: '*/*', ...(opts.headers ?? {}) },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url).toString();
      continue;
    }
    return res;
  }
  throw new Error('Забагато перенаправлень');
}

export async function readLimited(res: Response, max: number): Promise<Buffer> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len && len > max) throw new Error(`Файл завеликий (${Math.round(len / 1e6)} МБ)`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of res.body as any as AsyncIterable<Uint8Array>) {
    size += c.length;
    if (size > max) throw new Error('Файл завеликий');
    chunks.push(Buffer.from(c));
  }
  return Buffer.concat(chunks);
}
