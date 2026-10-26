// Local-disk file storage. Rendered images live under DATA_DIR/public and are served
// with long-lived cache headers (file names are content hashes, so they never change).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

export const publicDir = path.join(env.dataDir, 'public');
export const cacheDir = path.join(env.dataDir, 'cache');
export const tmpDir = path.join(env.dataDir, 'tmp');

export function ensureDirs() {
  for (const d of [publicDir, cacheDir, tmpDir, path.join(publicDir, 'r'), path.join(publicDir, 'a'), path.join(publicDir, 'feeds')])
    fs.mkdirSync(d, { recursive: true });
}

function safe(key: string) {
  const p = path.resolve(publicDir, key);
  if (!p.startsWith(publicDir + path.sep)) throw new Error('bad key');
  return p;
}

export async function put(key: string, data: Buffer | string) {
  const p = safe(key);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, p); // atomic replace — readers never see partial files
}

export function exists(key: string) {
  return fs.existsSync(safe(key));
}

export async function list(prefix: string): Promise<{ name: string; mtimeMs: number }[]> {
  const dir = safe(prefix);
  try {
    const names = await fsp.readdir(dir);
    const out: { name: string; mtimeMs: number }[] = [];
    for (const n of names) {
      if (n.endsWith('.tmp')) continue;
      const st = await fsp.stat(path.join(dir, n));
      out.push({ name: n, mtimeMs: st.mtimeMs });
    }
    return out;
  } catch {
    return [];
  }
}

export async function remove(key: string) {
  await fsp.rm(safe(key), { force: true, recursive: true });
}

export function publicUrl(key: string) {
  return `${env.publicUrl}/${key}`;
}
