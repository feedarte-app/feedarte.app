import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { builtinTemplates } from '../src/shared/templates';
import { renderProduct } from '../src/server/render/engine';
const OUT = process.argv[2] ?? '.';
const disc = { id: 'X1', title: 'Кепка чоловіча Tommy Hilfiger з написом чорна', brand: 'Tommy Hilfiger', price: '1170 UAH', sale_price: '819 UAH', image_link: 'http://localhost:4000/img/cap-1d1d1f-1.jpg' };
const reg = { ...disc, sale_price: undefined as any, title: 'Худі жіноча Levi\'s зелена', brand: "Levi's", image_link: 'http://localhost:4000/img/hoodie-2e6b4a-1.jpg', price: '4300 UAH' };
delete (reg as any).sale_price;
const tiles: Buffer[] = [];
for (const t of builtinTemplates()) for (const p of [disc, reg]) tiles.push((await renderProduct(t.doc, p as any)).buf);
// contact sheet
const cell = 300; const cols = 6; const rows = Math.ceil(tiles.length / cols);
const c = createCanvas(cols * cell, rows * cell * 1.8); const g = c.getContext('2d'); g.fillStyle = '#ccc'; g.fillRect(0,0,c.width,c.height);
let i = 0;
for (const b of tiles) { const img = await loadImage(b); const s = Math.min(cell / img.width, (cell*1.8) / img.height); g.drawImage(img, (i % cols) * cell, Math.floor(i / cols) * cell * 1.8, img.width * s, img.height * s); i++; }
fs.writeFileSync(`${OUT}/sheet.jpg`, await c.encode('jpeg', 85));
console.log('ok', tiles.length);
