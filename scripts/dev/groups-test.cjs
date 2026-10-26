const { chromium } = require('playwright');
const [out, designId] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3000/login');
  await p.fill('input[type=email]', 'admin@ludi.digital'); await p.fill('input[type=password]', 'admin12345');
  await p.click('button:has-text("Увійти")'); await p.waitForURL('http://localhost:3000/');
  await p.goto('http://localhost:3000/designs/' + designId); await p.waitForTimeout(2500);
  // product photo
  await p.locator('button[title="Додати на полотно"]').first().click(); await p.waitForTimeout(300);
  // smart price block
  await p.click('button:has(span:text-is("Текст"))'); await p.waitForTimeout(300);
  await p.click('button:has-text("Ціна: стара над новою")'); await p.waitForTimeout(600);
  await p.click('button:has-text("Бейдж знижки")'); await p.waitForTimeout(400);
  // brand logo
  await p.click('button:has(span:text-is("Фото"))'); await p.waitForTimeout(400);
  await p.click('button:has-text("На полотно")'); await p.waitForTimeout(800);
  // discount product
  await p.selectOption('select:has(option[value=discount])', 'discount'); await p.waitForTimeout(1500);
  await p.screenshot({ path: out + '/g1-discount.png' });
  // no discount
  await p.selectOption('select:has(option[value=discount])', 'nodiscount'); await p.waitForTimeout(1500);
  await p.click('button:has(span:text-is("Шари"))'); await p.waitForTimeout(400);
  await p.screenshot({ path: out + '/g2-nodiscount.png' });
  // click a price group member on canvas → whole group selected; drag it
  const c = await p.locator('canvas').first().boundingBox();
  const z = c.width / 1080;
  await p.click('div:has-text("Блок ціни") >> nth=-1'); await p.waitForTimeout(300);
  const before = await p.locator('input').filter({ hasText: '' }).count();
  await p.mouse.move(c.x + 540 * z, c.y + 830 * z); await p.mouse.down();
  await p.mouse.move(c.x + 540 * z, c.y + 700 * z, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(500);
  await p.screenshot({ path: out + '/g3-moved.png' });
  // shift-select logo + badge → group
  console.log(JSON.stringify(errs));
  await b.close();
})();
