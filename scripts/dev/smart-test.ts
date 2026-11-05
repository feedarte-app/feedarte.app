import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { registerFonts } from '../../src/server/render/engine';
import { analyzeImage, drawDesign, resolveDesign } from '../../src/shared/render';
import { makeImage, makeShape } from '../../src/shared/layers';
import { ProductContext } from '../../src/shared/fields';
registerFonts();
const dir = process.argv[2];
(async () => {
  const names = ['ring.jpg', 'bottle.jpg', 'chair.png', 'life.jpg'];
  const sheet = createCanvas(4 * 540, 2 * 540);
  const sg = sheet.getContext('2d');
  for (const [i, n] of names.entries()) {
    const img = await loadImage(fs.readFileSync(`${dir}/${n}`));
    console.log(n, JSON.stringify(analyzeImage(img)));
    for (const [row, bg] of (['card', 'blend'] as const).entries()) {
      const doc: any = { width: 1080, height: 1080, background: { color: '#F6E7EF' }, format: {}, layers: [
        makeShape({ x: 0, y: 0, w: 1080, h: 1080, fill: { type: 'solid', color: '#F6E7EF' } } as any),
        { ...makeImage({ x: 140, y: 120, w: 800, h: 800, radius: 40 } as any), fit: 'smart', smart: { pad: 8, bg }, source: { kind: 'url', url: 'x' } },
      ] };
      const r = resolveDesign(doc, new ProductContext({}, doc.format));
      const c = createCanvas(1080, 1080);
      drawDesign(c.getContext('2d'), r, new Map([['x', img]]));
      sg.drawImage(c, i * 540, row * 540, 540, 540);
    }
  }
  fs.writeFileSync(`${dir}/smart-sheet.png`, sheet.toBuffer('image/png'));
})();
