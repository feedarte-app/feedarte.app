import { builtinTemplates } from '../../src/shared/templates';
import { renderProduct, registerFonts } from '../../src/server/render/engine';
registerFonts();
const doc = builtinTemplates().find((t) => t.id === 'b-sale')!.doc;
const p = (i: number) => ({ id: 'X' + i, title: 'Кепка чоловіча Tommy Hilfiger ' + i, brand: 'Tommy', price: `${1000 + i} UAH`, sale_price: `${800 + i} UAH`, image_link: 'http://localhost:4000/img/cap-1d1d1f-1.jpg' });
await renderProduct(doc, p(0) as any);
const t = Date.now();
for (let i = 1; i <= 40; i++) await renderProduct(doc, p(i) as any);
console.log('avg render ms', (Date.now() - t) / 40);
