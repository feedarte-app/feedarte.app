import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { storyTemplates } from '../../src/shared/templates-story';
import { renderProduct, registerFonts } from '../../src/server/render/engine';
registerFonts();
const [OUT, IMG, only = ''] = process.argv.slice(2);
const products = [
  { id: 'K5C01ASI', title: 'Сукня-сорочка міді з поясом', brand: 'Gloray', color: 'Червоний', size: 'XS–L', price: '3290 UAH', sale_price: '2490 UAH', image_link: '/a/model.jpg', additional_image_link: ['/a/dress.jpg', '/a/model_close.jpg', '/a/sneaker.jpg'] },
  { id: 'RN-2207', title: 'Кросівки бігові Nimbus Air', brand: 'Runlab', color: 'Синій', price: '3290 UAH', image_link: '/a/sneaker.jpg' },
  { id: 'AU-925', title: 'Каблучка з топазом, срібло 925', brand: 'Aurum', price: '2190 UAH', sale_price: '1590 UAH', image_link: '/a/ring.jpg', additional_image_link: ['/a/ring.jpg'] },
];
(async () => {
  const adir = './data/public/a';
  fs.mkdirSync(adir, { recursive: true });
  for (const f of fs.readdirSync(IMG)) if (/\.(jpg|png)$/.test(f)) fs.copyFileSync(`${IMG}/${f}`, `${adir}/${f}`);
  const list = storyTemplates().filter((t) => !only || t.id.includes(only));
  const cw = 360, chh = 640;
  const c = createCanvas(products.length * (cw + 12) + 230, list.length * (chh + 12));
  const g = c.getContext('2d');
  g.fillStyle = '#cfcfd3';
  g.fillRect(0, 0, c.width, c.height);
  for (const [r, t] of list.entries()) {
    g.fillStyle = '#111';
    g.font = '600 20px Inter';
    g.fillText(t.name, 10, r * (chh + 12) + 34);
    for (const [i, p] of products.entries()) {
      const { buf } = await renderProduct(t.doc, p as any, 'jpg');
      g.drawImage(await loadImage(buf), 230 + i * (cw + 12), r * (chh + 12), cw, chh);
    }
  }
  fs.writeFileSync(`${OUT}/story-${only || 'all'}.jpg`, await c.encode('jpeg', 84));
  console.log('ok', list.length);
})();
