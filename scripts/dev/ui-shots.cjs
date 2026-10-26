// Dev helper: screenshots of main screens.  node scripts/dev/ui-shots.cjs <outDir> <feedId> <designId>
const { chromium } = require('playwright');
const [out, feedId, designId] = process.argv.slice(2);
const B = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(B + '/login'); await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/n0-login.png` });
  await p.fill('input[type=email]', 'admin@ludi.digital'); await p.fill('input[type=password]', 'admin12345');
  await p.click('button:has-text("Увійти")'); await p.waitForURL(B + '/'); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/n1-projects.png` });
  await p.goto(`${B}/feeds/${feedId}`); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/n2-feed.png` });
  await p.click('button:has-text("Новий дизайн")'); await p.waitForTimeout(2200);
  await p.screenshot({ path: `${out}/n3-modal.png` });
  await p.keyboard.press('Escape');
  await p.goto(`${B}/designs/${designId}`); await p.waitForTimeout(3500);
  const c = await p.locator('canvas').first().boundingBox();
  await p.mouse.click(c.x + c.width * 0.82, c.y + c.height * 0.13); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/n4-editor.png` });
  console.log(JSON.stringify(errors));
  await b.close();
})();
