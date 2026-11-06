import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { editorialTemplates } from '../../src/shared/templates-editorial';
import { renderProduct, registerFonts } from '../../src/server/render/engine';
registerFonts();
const [OUT, IMG, fmt = 'story'] = process.argv.slice(2);
const desc = 'Лаконічний силует, м’яка фактура та продумані деталі. Костюм — про естетику повсякденності, свободу рухів і комфорт у кожній миті.';
const products = [
  { id: 'GL-1', title: 'Knitted suit', brand: 'Gloray', description: desc, price: '4200 UAH', image_link: '/a/g0.jpg', additional_image_link: ['/a/g1.jpg', '/a/g2.jpg', '/a/pack.jpg'] },
  { id: 'GL-2', title: 'Zip-sweatshirt', brand: 'Gloray', description: desc, price: '2390 UAH', sale_price: '1990 UAH', image_link: '/a/g3.jpg', additional_image_link: ['/a/pack.jpg'] },
  { id: 'GL-3', title: 'Костюм трикотажний', brand: 'Gloray', description: desc, price: '4680 UAH', image_link: '/a/g1.jpg' },
];
(async () => {
  const adir = './data/public/a';
  for (const f of fs.readdirSync(IMG)) if (/\.(jpg|png)$/.test(f)) fs.copyFileSync(`${IMG}/${f}`, `${adir}/${f}`);
  const list = editorialTemplates().filter((t) => t.formatId === fmt);
  const cw = 360, chh = Math.round((cw * list[0].doc.height) / list[0].doc.width);
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
  fs.writeFileSync(`${OUT}/ed-${fmt}.jpg`, await c.encode('jpeg', 84));
  console.log('ok', list.length);
})();
