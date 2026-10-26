import fs from 'node:fs';
import { importFromImage } from '../../src/server/import/image-ai';
import { renderProduct } from '../../src/server/render/engine';
import { runMigrations, sqlClient, db, schema } from '../../src/server/db';
import { ensureDirs } from '../../src/server/storage';
const out = process.argv[2];
async function main() {
  ensureDirs(); await runMigrations();
  const [p] = await db.select().from(schema.projects).limit(1);
  const file = fs.readFileSync(`${out}/figma-import.jpg`); // 1080x1080 mockup, sent downscaled ×1 (≤1568)
  const r = await importFromImage({
    file, projectId: p.id, width: 1080, apiKey: '',
    analyze: async (_png, w, h) => {
      console.log('sent', w, h);
      return { background_color: '#F6EFE7', elements: [
        { kind: 'product_photo', x: 220, y: 100, w: 640, h: 640 },
        { kind: 'shape', role: 'discount', shape_type: 'ellipse', x: 860, y: 40, w: 180, h: 180, fill_color: '#E53935' },
        { kind: 'text', role: 'discount', text: '-30%', x: 885, y: 105, w: 130, h: 48, font_family: 'Montserrat', font_size: 44, font_weight: 700, color: '#FFFFFF', align: 'center' },
        { kind: 'text', role: 'title', text: "Худі жіноча Levi's зелена з довгою назвою", x: 60, y: 820, w: 590, h: 100, font_family: 'Manrope', font_size: 40, font_weight: 700, color: '#1B1B1B', align: 'left' },
        { kind: 'text', role: 'old_price', text: '4 300 грн', x: 830, y: 828, w: 190, h: 40, font_family: 'Inter', font_size: 34, color: '#9A9A9A', align: 'right', strikethrough: true },
        { kind: 'text', role: 'current_price', text: '2 990 грн', x: 730, y: 880, w: 290, h: 70, font_family: 'Inter', font_size: 62, font_weight: 800, color: '#E53935', align: 'right' },
        { kind: 'logo', x: 60, y: 985, w: 120, h: 40 },
        { kind: 'text', role: 'static', text: 'ДОСТАВКА 24 ГОД', x: 710, y: 992, w: 310, h: 36, font_family: 'Inter', font_size: 30, font_weight: 500, color: '#555555', align: 'right', uppercase: true },
      ] };
    },
  });
  console.log(JSON.stringify(r.stats), r.notes);
  const prod = { title: 'Кепка чоловіча Tommy Hilfiger чорна', price: '1470 UAH', sale_price: '1170 UAH', brand: 'Tommy', image_link: 'http://localhost:4000/img/cap-1d1d1f-1.jpg' };
  fs.writeFileSync(`${out}/ai-import.jpg`, (await renderProduct(r.doc, prod as any)).buf);
  const nd: any = { ...prod }; delete nd.sale_price;
  fs.writeFileSync(`${out}/ai-import-nodisc.jpg`, (await renderProduct(r.doc, nd)).buf);
  await sqlClient.end();
}
main();
