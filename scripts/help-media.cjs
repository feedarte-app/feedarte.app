// Regenerates knowledge-base screenshots/animations (web/public/help-media) from a local dev instance.
// Usage: node scripts/help-media.cjs <feedId> <outDir>   then convert *.webm → animated WebP with ffmpeg (see HELP_MEDIA.md).
// Captures screenshots (PNG) and short screen recordings (WEBM → GIF via ffmpeg later) for the knowledge base.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [feedId, out] = process.argv.slice(2);
const B = 'http://localhost:3000';
const VW = 1280, VH = 800;

const CURSOR = `(() => {
  if (window.__cur) return; window.__cur = 1;
  const c = document.createElement('div');
  c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;pointer-events:none;left:-40px;top:-40px;transition:transform .08s';
  c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l16 9-7 2-3 7z" fill="#16161a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const add = () => document.body && document.body.appendChild(c);
  add(); document.addEventListener('DOMContentLoaded', add);
  addEventListener('mousemove', (e) => { c.style.left = e.clientX - 3 + 'px'; c.style.top = e.clientY - 2 + 'px'; }, true);
  addEventListener('mousedown', () => (c.style.transform = 'scale(.82)'), true);
  addEventListener('mouseup', () => (c.style.transform = ''), true);
})()`;

async function login(p) {
  await p.goto(B + '/login');
  await p.fill('input[type=email]', 'admin@ludi.digital'); await p.fill('input[type=password]', 'admin12345');
  await p.click('button:has-text("Увійти")'); await p.waitForURL(B + '/');
}
async function highlight(p, sel, on = true) {
  await p.evaluate(([s, on]) => {
    document.querySelectorAll('[data-hl]').forEach((e) => { e.style.outline = ''; e.style.outlineOffset = ''; e.removeAttribute('data-hl'); });
    if (!on) return;
    const el = document.querySelector(s);
    if (el) { el.setAttribute('data-hl', '1'); el.style.outline = '3px solid #ff6b1a'; el.style.outlineOffset = '4px'; }
  }, [sel, on]);
}
async function glide(p, from, to, steps = 18) {
  for (let i = 1; i <= steps; i++) await p.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps), await p.waitForTimeout(16);
}
async function center(p, sel) { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; }

(async () => {
  const browser = await chromium.launch();
  const ONLY = process.env.ONLY;
  // ---------- screenshots ----------
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await login(p);
  const H = { origin: B };
  const f = await (await p.request.get(`${B}/api/feeds/${feedId}`)).json();
  const shot = async (name, opts = {}) => p.screenshot({ path: `${out}/${name}.png`, ...opts });

  // fresh designs used in pictures
  const mk = async (name, formatId, templateId) => {
    const ex = f.designs.find((d) => d.name === name); if (ex) return ex.id;
    const d = await (await p.request.post(`${B}/api/feeds/${feedId}/designs`, { data: { name, formatId, templateId }, headers: H })).json();
    await p.request.post(`${B}/api/designs/${d.design.id}/publish`, { headers: H }); return d.design.id;
  };
  const dPrice = await mk('Підпис з ціною', 'portrait', 'ed-m3-portrait');
  const dStory = f.designs.find((d) => d.formatId === 'story')?.id;
  const dMain = f.designs.find((d) => d.formatId === 'portrait')?.id;

  if (!ONLY) {
  // feed page + getting started (reset the hide flag)
  await p.goto(`${B}/feeds/${feedId}`); await p.evaluate(() => { localStorage.clear(); }); await p.reload(); await p.waitForTimeout(1500);
  await shot('feed-overview', { clip: { x: 0, y: 90, width: VW, height: 700 } });
  await highlight(p, '[data-testid=copy-feed-link]'); await shot('feed-copy-link', { clip: { x: 0, y: 380, width: VW, height: 420 } }); await highlight(p, '', false);
  // new design modal
  await p.click('button:has-text("Новий дизайн")'); await p.waitForTimeout(1200); await shot('new-design'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // output settings
  await p.locator('[data-testid=design-menu]').first().click(); await p.waitForTimeout(300); await shot('design-menu', { clip: { x: 0, y: 380, width: VW, height: 420 } });
  await p.click('text=Налаштування фіду'); await p.waitForTimeout(500);
  await shot('output-settings');
  await p.click('[data-testid=sec-click] > button'); await p.waitForTimeout(200); await p.click('[data-testid=ct-direct]'); await p.waitForTimeout(400);
  await p.locator('[data-testid=click-target]').screenshot({ path: `${out}/direct-settings.png` });
  await p.click('[data-testid=ct-test-btn]'); await p.waitForSelector('[data-testid=ct-qr] svg'); await p.waitForTimeout(300);
  await p.locator('[data-testid=ct-test]').screenshot({ path: `${out}/direct-qr.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // meta catalog
  await p.click('button:has-text("Meta-каталог")'); await p.waitForTimeout(900);
  await p.locator('[data-testid=meta-catalog]').screenshot({ path: `${out}/meta-catalog.png` });
  const helper = p.locator('[data-testid=cat-helper] button').first();
  if (await helper.count()) {
    await helper.click(); await p.waitForTimeout(300);
    const sels = p.locator('[data-testid=cat-helper] select');
    await sels.nth(0).selectOption({ index: 2 }); await sels.nth(1).selectOption({ index: 4 }).catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('[data-testid=cat-helper]').screenshot({ path: `${out}/meta-helper.png` });
  }

  // editor overview with zones
  await p.goto(`${B}/designs/${dMain}`); await p.waitForTimeout(2500);
  await shot('editor-overview');
  // text selected → right panel
  const doc = (await (await p.request.get(`${B}/api/designs/${dMain}`)).json()).design.draft;
  const tl = doc.layers.find((l) => l.type === 'text' && /title/.test(l.text || ''));
  if (tl) { await p.locator(`[data-layer-id="${tl.id}"]`).first().click({ force: true }); await p.waitForTimeout(500); await shot('editor-text'); }
  // left: layers panel
  await p.locator('button:has(span:text-is("Шари"))').first().click(); await p.waitForTimeout(500);
  await p.locator('aside, [class*="w-[300px]"]').first().screenshot({ path: `${out}/editor-layers.png` }).catch(() => {});
  // story editor with safe zones
  if (dStory) {
    await p.evaluate(() => localStorage.setItem('fa_view', JSON.stringify({ crop: false, stories: true, reels: false, rulers: true })));
    await p.goto(`${B}/designs/${dStory}`); await p.waitForTimeout(2500);
    await shot('editor-story-zones');
    await p.evaluate(() => localStorage.setItem('fa_view', JSON.stringify({ crop: false, stories: false, reels: false, rulers: false })));
  }
  // attach section
  await p.goto(`${B}/designs/${dPrice}`); await p.waitForTimeout(2500);
  const doc2 = (await (await p.request.get(`${B}/api/designs/${dPrice}`)).json()).design.draft;
  const price = doc2.layers.find((l) => l.attach);
  if (price) {
    await p.locator(`[data-layer-id="${price.id}"]`).first().click({ force: true }); await p.waitForTimeout(500);
    const att = p.locator('text=Прив’язка до елемента').first();
    if (await att.count()) await att.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await shot('attach-panel');
  }
  // help page + direct mobile page
  const m = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await m.newPage();
  await mp.route('https://ig.me/**', (r) => r.fulfill({ status: 200, body: '' }));
  const tok = (await (await p.request.get(`${B}/api/feeds/${feedId}`)).json()).designs.find((d) => d.id === dMain).publicToken;
  await mp.goto(`${B}/go/${tok}/3001TH-S?test=1`); await mp.waitForTimeout(600);
  await mp.screenshot({ path: `${out}/direct-page.png` });
  await m.close();
  }
  await ctx.close();

  // ---------- recordings ----------
  const rec = async (name, fn) => {
    if (ONLY && ONLY !== name) return;
    const c = await browser.newContext({ viewport: { width: VW, height: VH }, recordVideo: { dir: `${out}/rec-${name}`, size: { width: VW, height: VH } } });
    await c.addInitScript(CURSOR);
    const q = await c.newPage();
    await login(q);
    await fn(q);
    await q.waitForTimeout(700);
    const v = q.video(); await c.close();
    fs.renameSync(await v.path(), `${out}/${name}.webm`);
  };

  // 1) shift-drag along one axis
  await rec('gif-shift-drag', async (q) => {
    await q.goto(`${B}/designs/${dMain}`); await q.waitForTimeout(2500);
    const t = doc.layers.find((l) => l.type === 'text' && /title/.test(l.text || ''));
    const c0 = await center(q, `[data-layer-id="${t.id}"]`);
    await glide(q, [640, 400], c0); await q.mouse.down(); await q.mouse.up(); await q.waitForTimeout(400);
    await q.keyboard.down('Shift'); await q.mouse.down();
    await glide(q, c0, [c0[0] + 140, c0[1] + 30], 30); await glide(q, [c0[0] + 140, c0[1] + 30], [c0[0] - 60, c0[1] - 20], 30);
    await q.mouse.up(); await q.keyboard.up('Shift'); await q.waitForTimeout(500);
    await q.keyboard.press('Control+z'); await q.waitForTimeout(400);
  });
  // 2) price follows title while switching products of different title length
  await rec('gif-attach', async (q) => {
    await q.goto(`${B}/designs/${dPrice}`); await q.waitForTimeout(2500);
    let at = [640, 400];
    for (const word of ['Puma', 'Tommy', 'Puma', 'Tommy']) {
      const pick = await center(q, '.bottom-4 button:has(svg.lucide-search)');
      await glide(q, at, pick); await q.mouse.down(); await q.mouse.up(); await q.waitForTimeout(300);
      await q.keyboard.press('Control+a'); await q.keyboard.type(word, { delay: 60 }); await q.waitForTimeout(800);
      const first = await center(q, '.max-h-72 button');
      await glide(q, pick, first, 10); await q.mouse.down(); await q.mouse.up(); await q.waitForTimeout(1300);
      at = first;
    }
  });
  // 3) rulers + guide
  await rec('gif-rulers', async (q) => {
    await q.goto(`${B}/designs/${dMain}`); await q.waitForTimeout(2500);
    const vm = await center(q, '[data-testid=view-menu]'); await glide(q, [640, 400], vm); await q.mouse.down(); await q.mouse.up(); await q.waitForTimeout(500);
    const rb = await center(q, '[data-testid=view-rulers]'); await glide(q, vm, rb); await q.mouse.down(); await q.mouse.up(); await q.waitForTimeout(500);
    await q.mouse.click(30, 780); await q.waitForTimeout(400);
    const top = await q.locator('[data-testid=ruler-top]').boundingBox();
    const s0 = [top.x + top.width * 0.3, top.y + 10];
    await glide(q, [30, 780], s0); await q.mouse.down(); await glide(q, s0, [s0[0], s0[1] + 380], 40); await q.mouse.up(); await q.waitForTimeout(600);
    const left = await q.locator('[data-testid=ruler-left]').boundingBox();
    const l0 = [left.x + 10, left.y + left.height * 0.5];
    await glide(q, [s0[0], s0[1] + 380], l0); await q.mouse.down(); await glide(q, l0, [l0[0] + 120, l0[1]], 30); await q.mouse.up(); await q.waitForTimeout(800);
    await q.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('fa_guides_')) localStorage.removeItem(k); localStorage.setItem('fa_view', JSON.stringify({ crop: false, stories: false, reels: false, rulers: false })); });
  });
  // 4) conditions: "Усі шари" vs "Як у рекламі" + switching products
  await rec('gif-conditions', async (q) => {
    await q.goto(`${B}/designs/${dPrice}`); await q.waitForTimeout(2500);
    const a = await center(q, 'button:has-text("Як у рекламі")'); await glide(q, [640, 400], a); await q.mouse.down(); await q.mouse.up(); await q.waitForTimeout(1200);
    const b2 = await center(q, 'button:has-text("Усі шари")'); await glide(q, a, b2); await q.mouse.down(); await q.mouse.up(); await q.waitForTimeout(1200);
  });
  await browser.close();
  console.log('done');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
