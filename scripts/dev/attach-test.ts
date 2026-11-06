import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { editorialTemplates } from '../../src/shared/templates-editorial';
import { renderProduct, registerFonts } from '../../src/server/render/engine';
registerFonts();
const [OUT] = process.argv.slice(2);
const t = editorialTemplates().find((x) => x.id === 'ed-m3-portrait')!;
console.log(t.doc.layers.filter((l) => l.attach).map((l) => [l.name, JSON.stringify(l.attach)]), t.doc.layers.find((l) => l.name === 'Назва')?.id);
(async () => {
  const titles = ['Палаццо шоколад', 'Спідниця-шорти червона', 'Топ', 'Костюм трикотажний оверсайз'];
  const c = createCanvas(4 * 400, 500);
  const g = c.getContext('2d');
  for (const [i, title] of titles.entries()) {
    const { buf } = await renderProduct(t.doc, { id: 'x', title, price: '2690 UAH', description: 'Палаццо — елегантні широкі штани, що втілюють дух італійської розкоші та мінімалізму.', image_link: '/a/g0.jpg' } as any, 'jpg');
    const im = await loadImage(buf);
    g.drawImage(im, 0, 700, 1080, 400, i * 400, 0, 400, 148);
    g.drawImage(im, 0, 600, 1080, 600, i * 400, 160, 400, 222);
  }
  fs.writeFileSync(`${OUT}/attach.jpg`, await c.encode('jpeg', 88));
})();
