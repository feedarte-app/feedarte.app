const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:3000/login');
  await p.fill('input[type=email]', 'admin@ludi.digital'); await p.fill('input[type=password]', 'admin12345');
  await p.click('button:has-text("Увійти")'); await p.waitForURL('http://localhost:3000/');
  await p.goto('http://localhost:3000/admin'); await p.waitForTimeout(1200);
  await p.screenshot({ path: process.argv[2] + '/a1-users.png' });
  await p.click('button:has-text("Система та черга")'); await p.waitForTimeout(1500);
  await p.screenshot({ path: process.argv[2] + '/a2-system.png' });
  await p.goto('http://localhost:3000/register'); 
  console.log(errors);
  await b.close();
})();
