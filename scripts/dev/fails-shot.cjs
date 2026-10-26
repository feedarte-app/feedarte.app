const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3000/login');
  await p.fill('input[type=email]', 'admin@ludi.digital'); await p.fill('input[type=password]', 'admin12345');
  await p.click('button:has-text("Увійти")'); await p.waitForURL('http://localhost:3000/');
  await p.goto('http://localhost:3000/feeds/' + process.argv[3]); await p.waitForTimeout(1500);
  await p.click('button:has-text("помилка")'); await p.waitForTimeout(500);
  await p.screenshot({ path: process.argv[2] + '/fails.png' });
  console.log(errs); await b.close();
})();
