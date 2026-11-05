import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { libraryTemplates } from '../../src/shared/templates-lib';
import { renderProduct, registerFonts } from '../../src/server/render/engine';
registerFonts();
const [OUT, IMG, fmt = 'square', only = ''] = process.argv.slice(2);
const P = (img: string, extra: any = {}) => ({ id: 'X', title: 'Сукня-сорочка міді з поясом бежева', brand: 'Gloray', price: '3290 UAH', sale_price: '2490 UAH', image_link: `/a/${img}`, ...extra });
const products = [
  P('model.jpg', { additional_image_link: ['/a/sneaker.jpg'] }),
  P('sneaker.jpg', { title: 'Кросівки бігові Nimbus Air', brand: 'Runlab', sale_price: undefined }),
  P('ring.jpg', { title: 'Каблучка з топазом, срібло 925', brand: 'Aurum' }),
  P('chair.png', { title: 'Крісло Oslo велюр теракотове', brand: 'Homie', price: '12900 UAH', sale_price: undefined }),
  P('bottle.jpg', { title: 'Термопляшка 750 мл', brand: 'Hydro' }),
];
(async () => {
  // put sample images where fetchImageBytes expects uploaded assets
  const adir = './data/public/a';
  fs.mkdirSync(adir, { recursive: true });
  for (const f of fs.readdirSync(IMG)) if (/\.(jpg|png)$/.test(f)) fs.copyFileSync(`${IMG}/${f}`, `${adir}/${f}`);
  const list = libraryTemplates().filter((t) => t.formatId === fmt && (!only || t.id.includes(only)));
  const cw = 300;
  const chh = Math.round((cw * list[0].doc.height) / list[0].doc.width);
  const c = createCanvas(products.length * (cw + 10) + 260, list.length * (chh + 10));
  const g = c.getContext('2d');
  g.fillStyle = '#d0d0d4';
  g.fillRect(0, 0, c.width, c.height);
  for (const [r, t] of list.entries()) {
    g.fillStyle = '#111';
    g.font = '600 18px Inter';
    g.fillText(t.name, 8, r * (chh + 10) + 30);
    g.font = '13px Inter';
    g.fillText(t.niches.join(', '), 8, r * (chh + 10) + 54);
    for (const [i, p] of products.entries()) {
      const { buf } = await renderProduct(t.doc, p as any, 'jpg');
      const img = await loadImage(buf);
      g.drawImage(img, 260 + i * (cw + 10), r * (chh + 10), cw, chh);
    }
  }
  fs.writeFileSync(`${OUT}/lib-${fmt}${only ? '-' + only : ''}.jpg`, await c.encode('jpeg', 82));
  console.log('ok', list.length);
})();
