import zlib from 'node:zlib';

/** Minimal sfnt reader: enough to name and classify an uploaded TTF/OTF (or WOFF 1.0) font. */
export interface FontInfo {
  family: string; // typographic family (name ID 16, else 1)
  subfamily: string;
  weight: number; // OS/2 usWeightClass
  weightRange: [number, number] | null; // variable font wght axis
  italic: boolean;
  hasUkrainian: boolean; // і ї є ґ present in cmap
  format: 'ttf' | 'otf';
  sfnt: Buffer; // plain TTF/OTF bytes (WOFF is unpacked)
}

export class FontError extends Error {}

const tag = (b: Buffer, o: number) => b.toString('latin1', o, o + 4);

function unwoff(b: Buffer): Buffer {
  // WOFF 1.0 → sfnt
  const numTables = b.readUInt16BE(12);
  const flavor = b.readUInt32BE(4);
  const tables: { tag: string; data: Buffer }[] = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const t = tag(b, o);
    const off = b.readUInt32BE(o + 4);
    const comp = b.readUInt32BE(o + 8);
    const orig = b.readUInt32BE(o + 12);
    const raw = b.subarray(off, off + comp);
    tables.push({ tag: t, data: comp < orig ? zlib.inflateSync(raw) : Buffer.from(raw) });
  }
  const headLen = 12 + numTables * 16;
  let size = headLen;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = Buffer.alloc(size);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  let es = 0;
  while (1 << (es + 1) <= numTables) es++;
  out.writeUInt16BE((1 << es) * 16, 6);
  out.writeUInt16BE(es, 8);
  out.writeUInt16BE(numTables * 16 - (1 << es) * 16, 10);
  let off = headLen;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    out.write(t.tag, o, 'latin1');
    out.writeUInt32BE(0, o + 4);
    out.writeUInt32BE(off, o + 8);
    out.writeUInt32BE(t.data.length, o + 12);
    t.data.copy(out, off);
    off += (t.data.length + 3) & ~3;
  });
  return out;
}

export function readFont(input: Buffer): FontInfo {
  if (input.length < 64) throw new FontError('Файл замалий для шрифту');
  const sig = tag(input, 0);
  if (sig === 'wOF2') throw new FontError('WOFF2 не підтримується — завантажте TTF або OTF (конвертувати можна на transfonter.org)');
  if (sig === 'ttcf') throw new FontError('Колекції шрифтів (.ttc) не підтримуються — завантажте окремі TTF/OTF файли');
  const b = sig === 'wOFF' ? unwoff(input) : input;
  const ver = b.readUInt32BE(0);
  const isOtf = tag(b, 0) === 'OTTO';
  if (ver !== 0x00010000 && !isOtf && tag(b, 0) !== 'true') throw new FontError('Це не схоже на файл шрифту (потрібен TTF або OTF)');

  const n = b.readUInt16BE(4);
  const dir = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (o + 16 > b.length) throw new FontError('Пошкоджений файл шрифту');
    dir.set(tag(b, o), { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) });
  }
  for (const need of ['cmap', 'name']) if (!dir.has(need)) throw new FontError('Пошкоджений файл шрифту');

  // ---- name ----
  const names = new Map<number, string>();
  {
    const { off } = dir.get('name')!;
    const count = b.readUInt16BE(off + 2);
    const strOff = off + b.readUInt16BE(off + 4);
    const pick = new Map<number, { score: number; s: string }>();
    for (let i = 0; i < count; i++) {
      const r = off + 6 + i * 12;
      const platform = b.readUInt16BE(r);
      const enc = b.readUInt16BE(r + 2);
      const lang = b.readUInt16BE(r + 4);
      const id = b.readUInt16BE(r + 6);
      const len = b.readUInt16BE(r + 8);
      const so = strOff + b.readUInt16BE(r + 10);
      if (![1, 2, 16, 17].includes(id) || so + len > b.length) continue;
      let s = '';
      let score = 0;
      if (platform === 3 || platform === 0) {
        const chars: number[] = [];
        for (let k = 0; k + 1 < len; k += 2) chars.push(b.readUInt16BE(so + k));
        s = String.fromCharCode(...chars);
        score = platform === 3 && (lang === 0x409 || lang === 0) ? 3 : 2;
      } else if (platform === 1 && enc === 0) {
        s = b.toString('latin1', so, so + len);
        score = 1;
      } else continue;
      const prev = pick.get(id);
      if (!prev || score > prev.score) pick.set(id, { score, s });
    }
    for (const [id, v] of pick) names.set(id, v.s.trim());
  }
  const family = (names.get(16) || names.get(1) || '').replace(/[\u0000-\u001f"\\]/g, '').slice(0, 80);
  const subfamily = (names.get(17) || names.get(2) || 'Regular').slice(0, 60);
  if (!family) throw new FontError('У шрифті немає назви');

  // ---- OS/2 ----
  let weight = 400;
  let italic = /italic|oblique/i.test(subfamily);
  const os2 = dir.get('OS/2');
  if (os2 && os2.len >= 64) {
    weight = b.readUInt16BE(os2.off + 4) || 400;
    if (weight < 100) weight = 400; // some fonts store 1..9
    italic = italic || (b.readUInt16BE(os2.off + 62) & 1) === 1;
  }
  weight = Math.max(100, Math.min(1000, Math.round(weight / 50) * 50));

  // ---- fvar (variable fonts) ----
  let weightRange: [number, number] | null = null;
  const fvar = dir.get('fvar');
  if (fvar) {
    const axesOff = fvar.off + b.readUInt16BE(fvar.off + 4);
    const axisCount = b.readUInt16BE(fvar.off + 8);
    const axisSize = b.readUInt16BE(fvar.off + 10);
    for (let i = 0; i < axisCount; i++) {
      const a = axesOff + i * axisSize;
      if (tag(b, a) === 'wght') {
        const f = (o: number) => b.readInt32BE(o) / 65536;
        weightRange = [Math.round(f(a + 4)), Math.round(f(a + 12))];
      }
    }
  }

  // ---- cmap: Ukrainian letters ----
  const hasUkrainian = cmapHas(b, dir.get('cmap')!.off, [0x0456, 0x0457, 0x0454, 0x0491]);

  return { family, subfamily, weight, weightRange, italic, hasUkrainian, format: isOtf ? 'otf' : 'ttf', sfnt: b };
}

function cmapHas(b: Buffer, off: number, cps: number[]): boolean {
  const n = b.readUInt16BE(off + 2);
  for (let i = 0; i < n; i++) {
    const r = off + 4 + i * 8;
    const pid = b.readUInt16BE(r);
    const eid = b.readUInt16BE(r + 2);
    if (!((pid === 3 && (eid === 1 || eid === 10)) || pid === 0)) continue;
    const st = off + b.readUInt32BE(r + 4);
    const fmt = b.readUInt16BE(st);
    if (fmt === 4) {
      const segX2 = b.readUInt16BE(st + 6);
      const ends = st + 14;
      const starts = ends + segX2 + 2;
      const found = (cp: number) => {
        for (let s = 0; s < segX2; s += 2) {
          if (cp <= b.readUInt16BE(ends + s)) return cp >= b.readUInt16BE(starts + s);
        }
        return false;
      };
      return cps.every(found);
    }
    if (fmt === 12) {
      const groups = b.readUInt32BE(st + 12);
      const found = (cp: number) => {
        for (let g = 0; g < groups; g++) {
          const o = st + 16 + g * 12;
          if (cp >= b.readUInt32BE(o) && cp <= b.readUInt32BE(o + 4)) return true;
        }
        return false;
      };
      return cps.every(found);
    }
  }
  return false;
}
