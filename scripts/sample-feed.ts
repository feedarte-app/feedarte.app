// Generates a realistic Google/Meta RSS sample feed (USMALL-like structure) with product photos,
// and serves it on http://localhost:4000/feed.xml for local testing.
//   npx tsx scripts/sample-feed.ts [count=400] [--serve]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createCanvas } from '@napi-rs/canvas';

const OUT = path.resolve('data/sample');
const COUNT = Number(process.argv[2] ?? 400);
const SERVE = process.argv.includes('--serve');
const BASE = process.env.SAMPLE_BASE ?? 'http://localhost:4000';

const brands = ['Tommy Hilfiger', 'Calvin Klein', 'Guess', 'Michael Kors', 'Levi\'s', 'Lacoste', 'Puma', 'Nike'];
const kinds = [
  { name: 'Кепка', type: 'Аксесуари', shape: 'cap', price: [900, 2200] },
  { name: 'Футболка', type: 'Одяг', shape: 'tee', price: [700, 2500] },
  { name: 'Худі', type: 'Одяг', shape: 'hoodie', price: [2200, 5200] },
  { name: 'Кросівки', type: 'Взуття', shape: 'shoe', price: [2800, 7900] },
  { name: 'Сумка', type: 'Аксесуари', shape: 'bag', price: [2500, 9900] },
];
const colors = [
  { n: 'чорна', hex: '#1d1d1f' },
  { n: 'біла', hex: '#f4f4f2' },
  { n: 'синя', hex: '#1f3b73' },
  { n: 'червона', hex: '#c62828' },
  { n: 'бежева', hex: '#d8c3a5' },
  { n: 'зелена', hex: '#2e6b4a' },
];
const genders = ['Чоловіки', 'Жінки'];
const sizesFor: Record<string, string[]> = {
  cap: ['ONE'],
  tee: ['S', 'M', 'L', 'XL'],
  hoodie: ['S', 'M', 'L'],
  shoe: ['40', '41', '42', '43'],
  bag: ['ONE'],
};

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

function drawProduct(shape: string, color: string, variant: number): Buffer {
  const S = 1000;
  const c = createCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#eeeeef';
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.beginPath();
  g.ellipse(S / 2, S * 0.8, S * 0.32, S * 0.04, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 6;
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate((variant % 3 - 1) * 0.06);
  g.translate(-S / 2, -S / 2);
  g.beginPath();
  if (shape === 'cap') {
    g.ellipse(500, 520, 230, 200, 0, Math.PI, 0);
    g.lineTo(730, 540);
    g.quadraticCurveTo(880, 560, 860, 640);
    g.quadraticCurveTo(700, 600, 270, 560);
    g.closePath();
  } else if (shape === 'tee' || shape === 'hoodie') {
    g.moveTo(330, 230);
    g.lineTo(420, 200);
    g.quadraticCurveTo(500, 260, 580, 200);
    g.lineTo(670, 230);
    g.lineTo(800, 380);
    g.lineTo(710, 440);
    g.lineTo(670, 400);
    g.lineTo(670, shape === 'hoodie' ? 800 : 760);
    g.lineTo(330, shape === 'hoodie' ? 800 : 760);
    g.lineTo(330, 400);
    g.lineTo(290, 440);
    g.lineTo(200, 380);
    g.closePath();
  } else if (shape === 'shoe') {
    g.moveTo(180, 640);
    g.lineTo(200, 470);
    g.quadraticCurveTo(320, 440, 420, 520);
    g.quadraticCurveTo(620, 560, 800, 600);
    g.quadraticCurveTo(860, 640, 830, 680);
    g.lineTo(190, 690);
    g.closePath();
  } else {
    g.roundRect(280, 380, 440, 380, 40);
    g.moveTo(400, 380);
    g.arc(500, 380, 100, Math.PI, 0);
  }
  g.fill();
  g.stroke();
  if (shape === 'shoe') {
    g.fillStyle = '#fff';
    g.fillRect(180, 660, 655, 30);
  }
  g.restore();
  return c.toBuffer('image/jpeg', 85);
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generate() {
  fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
  const items: string[] = [];
  let n = 0;
  let group = 0;
  const imgCache = new Set<string>();
  while (n < COUNT) {
    group++;
    const kind = pick(kinds);
    const brand = pick(brands);
    const gender = pick(genders);
    const base = Math.round((kind.price[0] + rnd() * (kind.price[1] - kind.price[0])) / 10) * 10;
    const discounted = rnd() < 0.4;
    const pct = [10, 15, 20, 25, 30, 40, 50][Math.floor(rnd() * 7)];
    const groupColors = colors.slice(0).sort(() => rnd() - 0.5).slice(0, 1 + Math.floor(rnd() * 3));
    for (const col of groupColors) {
      const imgName = `${kind.shape}-${col.hex.slice(1)}-${group % 3}.jpg`;
      if (!imgCache.has(imgName)) {
        fs.writeFileSync(path.join(OUT, 'img', imgName), drawProduct(kind.shape, col.hex, group));
        imgCache.add(imgName);
      }
      for (const size of sizesFor[kind.shape]) {
        if (n >= COUNT) break;
        n++;
        const id = `${3000 + n}TH${size !== 'ONE' ? '-' + size : ''}`;
        const title = `${kind.name} ${gender === 'Чоловіки' ? 'чоловіча' : 'жіноча'} ${brand} ${col.n}`;
        const sale = discounted ? Math.round((base * (100 - pct)) / 100) : 0;
        const fields: [string, string][] = [
          ['g:id', id],
          ['g:title', title],
          ['g:description', `${title}. Оригінальна продукція ${brand}. Розмір: ${size}.`],
          ['g:link', `https://usmall.com.ua/product/${id.toLowerCase()}`],
          ['g:image_link', `${BASE}/img/${imgName}`],
          ['g:additional_image_link', `${BASE}/img/${imgName}?v=2`],
          ['g:availability', rnd() < 0.9 ? 'in stock' : 'out of stock'],
          ['g:price', `${base} UAH`],
          ...(sale ? ([['g:sale_price', `${sale} UAH`]] as [string, string][]) : []),
          ['g:google_product_category', String(1604 + (n % 5))],
          ['g:item_group_id', `${400 + group}_${groupColors.indexOf(col) + 1}`],
          ['g:product_type', gender],
          ['g:brand', brand],
          ['g:condition', 'new'],
          ['g:color', col.n],
          ['g:size', size],
        ];
        items.push(`<item>\n${fields.map(([k, v]) => `  <${k}>${esc(v)}</${k}>`).join('\n')}\n</item>`);
      }
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Usmall - інтернет магазин брендового одягу</title>
<link>https://usmall.com.ua</link>
<description>Usmall - інтернет магазин брендового одягу</description>
${items.join('\n')}
</channel>
</rss>`;
  fs.writeFileSync(path.join(OUT, process.env.SAMPLE_NAME ?? 'feed.xml'), xml);
  console.log(`sample feed: ${items.length} items, ${imgCache.size} images → ${OUT}/feed.xml`);
}

generate();
if (SERVE) {
  http
    .createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://x');
      const p = path.join(OUT, path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''));
      if (!p.startsWith(OUT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': p.endsWith('.xml') ? 'application/xml' : 'image/jpeg' });
      fs.createReadStream(p).pipe(res);
    })
    .listen(4000, () => console.log('serving on http://localhost:4000/feed.xml'));
}
