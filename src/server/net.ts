// Outbound HTTP with SSRF protection (DNS-pinned), timeouts and size limits.
import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch as ufetch } from 'undici';
import { env } from './env';

function v4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0) || a >= 224
  );
}

/** Expand an IPv6 address to 8 numeric groups. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  // embedded dotted IPv4 tail (::ffff:1.2.3.4)
  const m = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const [a, b, c, d] = m[1].split('.').map(Number);
    s = s.slice(0, -m[1].length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = s.includes('::') ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(0, fill)).fill('0'), ...t];
  if (parts.length !== 8) return null;
  const g = parts.map((x) => parseInt(x || '0', 16));
  return g.some((x) => !Number.isFinite(x) || x < 0 || x > 0xffff) ? null : g;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return v4Private(ip);
  const g = v6Groups(ip);
  if (!g) return true; // unparseable → refuse
  const embedded = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  const zero5 = g.slice(0, 5).every((x) => x === 0);
  if (zero5 && (g[5] === 0xffff || g[5] === 0)) return g[5] === 0 && g[6] === 0 ? true : v4Private(embedded()); // mapped / compatible / ::, ::1
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4Private(embedded()); // NAT64
  if (g[0] === 0x2002) return v4Private(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`); // 6to4
  const first = g[0];
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
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
  const addrs = net.isIP(host) ? [host] : (await dns.promises.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error('Адреса недоступна (внутрішня мережа)');
  return u;
}

// The connection itself re-validates the resolved address → no DNS-rebinding window.
const guardedLookup: typeof dns.lookup = ((hostname: string, options: any, cb: any) => {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  dns.lookup(hostname, { ...options, all: true }, (err, addresses: any) => {
    if (err) return cb(err);
    const list = (addresses as { address: string; family: number }[]).filter((a) => env.allowPrivateUrls || !isPrivateIp(a.address));
    if (!list.length) return cb(new Error('Адреса недоступна (внутрішня мережа)'));
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}) as any;

const dispatcher = new Agent({
  connect: { lookup: guardedLookup, timeout: 15000 },
  headersTimeout: 60000,
  bodyTimeout: 120000,
});

export const UA = 'Mozilla/5.0 (compatible; FeedarteBot/1.0; +https://feedarte.com)';

export async function safeFetch(
  raw: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; maxRedirects?: number } = {},
): Promise<Response> {
  let url = raw;
  for (let i = 0; i <= (opts.maxRedirects ?? 5); i++) {
    const u = await assertPublicUrl(url);
    // literal IPs skip DNS, so check them here too (assertPublicUrl did); hostnames are checked again on connect
    const res = (await ufetch(u.toString(), {
      redirect: 'manual',
      dispatcher,
      headers: { 'user-agent': UA, accept: '*/*', ...(opts.headers ?? {}) },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
    })) as unknown as Response;
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
