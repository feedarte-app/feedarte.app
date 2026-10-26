// Dev E2E: editor interactions + browser-vs-server render comparison.
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const BASE = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await p.goto(BASE + '/login');
  await p.fill('input[type=email]', 'admin@ludi.digital');
  await p.fill('input[type=password]', 'admin12345');
  await p.click('button:has-text("Увійти")');
  await p.waitForURL(BASE + '/');
  const designId = process.argv[3];
  await p.goto(`${BASE}/designs/${designId}`);
  await p.waitForTimeout(3000);
  // filter discounted products
  await p.selectOption('select:has(option[value=discount])', 'discount');
  await p.waitForTimeout(1500);
  // click on the brand text on the canvas (around top-right)
  const canvas = await p.locator('canvas').first().boundingBox();
  const zoom = canvas.width / 1080;
  const at = (x, y) => [canvas.x + x * zoom, canvas.y + y * zoom];
  let [x, y] = at(890, 145);
  await p.mouse.click(x, y);
  await p.waitForTimeout(300);
  const selName = await p.inputValue('div.w-\\[320px\\] input.ed-input >> nth=0');
  console.log('selected layer:', selName);
  // drag it 100px down
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + 5, y + 50 * zoom, { steps: 5 });
  await p.mouse.move(x + 5, y + 100 * zoom, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const yVal = await p.inputValue('input:near(:text("Позиція")) >> nth=1').catch(() => '?');
  console.log('after drag Y =', yVal);
  await p.screenshot({ path: `${out}/e1-dragged.png` });
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(400);
  console.log('after undo Y =', await p.inputValue('input:near(:text("Позиція")) >> nth=1').catch(() => '?'));
  // add title field from product tab
  await p.mouse.click(canvas.x + canvas.width + 30, canvas.y + 10); // deselect (empty area)
  await p.click('button:has(span:text-is("title"))');
  await p.waitForTimeout(500);
  console.log('added layer:', await p.inputValue('div.w-\\[320px\\] input.ed-input >> nth=0'));
  // toggle active-elements mode and screenshot
  await p.click('button:has-text("Активні елементи")');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/e2-added.png` });
  // undo the add so the design stays as template
  await p.keyboard.press('Escape');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(1500);
  // browser render at zoom 100% for pixel comparison
  await p.selectOption('select:has(option[value=fit])', '1');
  await p.waitForTimeout(2500);
  const dataUrl = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  require('fs').writeFileSync(`${out}/browser.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const title = await p.textContent('button:has(svg.lucide-search) span.truncate');
  console.log('product:', title);
  console.log('errors:', JSON.stringify(errors.slice(0, 10)));
  await b.close();
})();
