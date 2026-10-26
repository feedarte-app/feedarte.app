// Offline test of the Figma converter with a fixture shaped like the Figma REST API.
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { importFromFigma } from '../../src/server/import/figma';
import { renderProduct } from '../../src/server/render/engine';
import { runMigrations, sqlClient, db, schema } from '../../src/server/db';
import { ensureDirs } from '../../src/server/storage';

const out = process.argv[2];
const c = (hex: string, a = 1) => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255, a });
const bb = (x: number, y: number, width: number, height: number) => ({ x: 1000 + x, y: 500 + y, width, height });
const frame = {
  id: '12:34', name: 'Ad 1080', type: 'FRAME', absoluteBoundingBox: bb(0, 0, 540, 540), fills: [{ type: 'SOLID', color: c('#F6EFE7') }],
  children: [
    { id: '1:1', name: 'Card', type: 'RECTANGLE', absoluteBoundingBox: bb(30, 30, 480, 360), cornerRadius: 24, fills: [{ type: 'SOLID', color: c('#FFFFFF') }], effects: [{ type: 'DROP_SHADOW', visible: true, color: c('#000000', 0.15), offset: { x: 0, y: 6 }, radius: 18 }] },
    { id: '1:2', name: 'Product', type: 'RECTANGLE', absoluteBoundingBox: bb(60, 50, 420, 320), fills: [{ type: 'IMAGE', scaleMode: 'FIT', imageRef: 'abc' }] },
    { id: '1:3', name: 'Badge', type: 'ELLIPSE', absoluteBoundingBox: bb(430, 20, 90, 90), fills: [{ type: 'SOLID', color: c('#E53935') }] },
    { id: '1:4', name: 'pct', type: 'TEXT', characters: '-30%', absoluteBoundingBox: bb(440, 50, 70, 30), fills: [{ type: 'SOLID', color: c('#FFFFFF') }], style: { fontFamily: 'Poppins', fontWeight: 700, fontSize: 22, textAlignHorizontal: 'CENTER', textAlignVertical: 'CENTER', lineHeightPx: 26, textAutoResize: 'WIDTH_AND_HEIGHT' } },
    { id: '1:5', name: 'Назва', type: 'TEXT', characters: 'Кепка чоловіча Tommy Hilfiger', absoluteBoundingBox: bb(30, 410, 330, 60), fills: [{ type: 'SOLID', color: c('#1B1B1B') }], style: { fontFamily: 'Manrope', fontWeight: 700, fontSize: 22, textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP', lineHeightPercentFontSize: 120 } },
    { id: '1:6', name: 'old', type: 'TEXT', characters: '1 470 грн', absoluteBoundingBox: bb(380, 412, 130, 24), fills: [{ type: 'SOLID', color: c('#9A9A9A') }], style: { fontFamily: 'Inter', fontWeight: 400, fontSize: 18, textAlignHorizontal: 'RIGHT', lineHeightPx: 22 } },
    { id: '1:20', name: 'Line 3', type: 'LINE', absoluteBoundingBox: bb(375, 423, 140, 2), strokes: [{ type: 'SOLID', color: c('#999999') }], strokeWeight: 2 },
    { id: '1:7', name: 'price', type: 'TEXT', characters: '1 170 грн', absoluteBoundingBox: bb(360, 440, 150, 40), fills: [{ type: 'SOLID', color: c('#E53935') }], style: { fontFamily: 'Inter', fontWeight: 800, fontSize: 32, textAlignHorizontal: 'RIGHT', lineHeightPx: 38 } },
    { id: '1:8', name: 'Logo', type: 'GROUP', absoluteBoundingBox: bb(30, 490, 120, 30), children: [
      { id: '1:9', name: 'v1', type: 'VECTOR', absoluteBoundingBox: bb(30, 490, 40, 30) }, { id: '1:10', name: 'v2', type: 'VECTOR', absoluteBoundingBox: bb(75, 490, 75, 30) } ] },
    { id: '1:11', name: 'cta', type: 'TEXT', characters: 'Доставка 24 год', absoluteBoundingBox: bb(330, 495, 180, 22), fills: [{ type: 'SOLID', color: c('#555555') }], style: { fontFamily: 'Helvetica Neue', fontWeight: 500, fontSize: 16, textAlignHorizontal: 'RIGHT', textCase: 'UPPER' } },
  ],
};
async function main() {
  ensureDirs();
  await runMigrations();
  const [p] = await db.select().from(schema.projects).limit(1);
  const logo = createCanvas(240, 60); const g = logo.getContext('2d'); g.fillStyle = '#111'; g.font = 'bold 40px Inter'; g.fillText('LOGO', 10, 46);
  const logoPng = await logo.encode('png');
  const r = await importFromFigma({
    url: 'https://www.figma.com/design/AbCdEf123/Ads?node-id=12-34',
    token: '', projectId: p.id, width: 1080,
    api: async (path) => {
      if (path.includes('/nodes')) return { nodes: { '12:34': { document: frame } } };
      if (path.startsWith('/v1/images/')) return { images: { '1:8': 'https://x/logo.png', '1:20': 'https://x/line.png' } };
      throw new Error('unexpected ' + path);
    },
    download: async () => logoPng,
  });
  console.log(JSON.stringify(r.stats), '\n' + r.notes.join('\n'));
  for (const l of r.doc.layers) console.log(l.type.padEnd(5), (l as any).name.padEnd(12), l.x, l.y, l.w, l.h, (l as any).text ?? (l as any).source?.field ?? (l as any).source?.url ?? '', l.condition ? 'COND' : '');
  const prod = { title: 'Худі жіноча Levi\'s зелена з довгою назвою', price: '4300 UAH', sale_price: '2990 UAH', brand: "Levi's", image_link: 'http://localhost:4000/img/hoodie-2e6b4a-1.jpg' };
  fs.writeFileSync(`${out}/figma-import.jpg`, (await renderProduct(r.doc, prod as any)).buf);
  const noDisc = { ...prod, sale_price: undefined } as any; delete noDisc.sale_price;
  fs.writeFileSync(`${out}/figma-import-nodisc.jpg`, (await renderProduct(r.doc, noDisc)).buf);
  await sqlClient.end();
}
main();
