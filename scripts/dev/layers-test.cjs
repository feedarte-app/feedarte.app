const { chromium } = require('playwright');
const [out, designId] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3000/login');
  await p.fill('input[type=email]', 'admin@ludi.digital'); await p.fill('input[type=password]', 'admin12345');
  await p.click('button:has-text("Увійти")'); await p.waitForURL('http://localhost:3000/');
  {
    const dd = (await (await p.request.get(`http://localhost:3000/api/designs/${designId}`)).json()).design.draft;
    if (!dd.groups?.length) {
      dd.groups = [{ id: 'gtest1', name: 'Тест група' }];
      const n = dd.layers.length;
      dd.layers[n - 1].groupId = 'gtest1'; dd.layers[n - 2].groupId = 'gtest1';
      await p.request.put(`http://localhost:3000/api/designs/${designId}/draft`, { data: { doc: dd }, headers: { origin: 'http://localhost:3000' } });
    }
  }
  await p.goto('http://localhost:3000/designs/' + designId); await p.waitForTimeout(2500);
  const draft = async () => { await p.waitForTimeout(1800); return (await (await p.request.get(`http://localhost:3000/api/designs/${designId}`)).json()).design.draft; };
  const zoomTxt = () => p.$eval('[data-testid=zoom]', (s) => s.options[s.selectedIndex].text);
  console.log('zoom start', await zoomTxt());
  const wrap = await p.locator('[data-testid=stage-wrap]').boundingBox();
  await p.mouse.move(wrap.x + wrap.width / 2, wrap.y + wrap.height / 2);
  await p.keyboard.down('Control'); await p.mouse.wheel(0, -40); await p.keyboard.up('Control'); await p.waitForTimeout(200);
  console.log('after pinch-in', await zoomTxt());
  await p.mouse.wheel(0, 100); await p.waitForTimeout(200);
  console.log('after mouse wheel down', await zoomTxt());
  await p.mouse.wheel(0, -100); await p.mouse.wheel(0, -100); await p.waitForTimeout(200);
  console.log('after wheel up x2', await zoomTxt());
  await p.screenshot({ path: out + '/l0-zoom.png' });
  await p.keyboard.press('Control+0'); await p.waitForTimeout(200);
  console.log('ctrl+0', await zoomTxt());

  await p.click('button:has(span:text-is("Шари"))'); await p.waitForTimeout(400);
  let d = await draft();
  console.log('groups', (d.groups || []).map((g) => g.name), 'layers', d.layers.length);
  const g0 = d.groups[0];
  const row = p.locator(`[data-testid=group-row-${g0.id}]`);
  await row.hover(); await row.locator('[data-testid=dup-group]').click();
  d = await draft();
  console.log('after dup group: groups', d.groups.map((g) => g.name), 'layers', d.layers.length);
  await p.screenshot({ path: out + '/l1-dup.png' });

  // right click a plain layer → copy, then paste via context menu on canvas
  const plain = d.layers.find((l) => !l.groupId);
  await p.locator(`[data-testid=layer-row-${plain.id}]`).click({ button: 'right' }); await p.waitForTimeout(200);
  await p.screenshot({ path: out + '/l2-menu.png' });
  await p.click('[data-testid=ctx-menu] button:has-text("Копіювати")');
  await p.mouse.click(wrap.x + 20, wrap.y + 20, { button: 'right' }); await p.waitForTimeout(200);
  await p.click('[data-testid=ctx-menu] button:has-text("Вставити")');
  d = await draft();
  console.log('after copy/paste layers', d.layers.length);

  // drag group (original) to the bottom of the list
  const order = (dd) => dd.layers.map((l) => (l.groupId ? 'G:' + dd.groups.find((g) => g.id === l.groupId).name : l.name)).reverse();
  console.log('order before', order(d));
  const rows = p.locator('[data-testid^=layer-row-],[data-testid^=group-row-]');
  const last = rows.last();
  const lb = await last.boundingBox();
  await row.dragTo(last, { targetPosition: { x: 40, y: lb.height - 3 } });
  d = await draft();
  console.log('order after drag group to bottom', order(d));
  // drag it up a few rows (both visible), using a real mouse sequence
  const src = p.locator(`[data-testid=group-row-${g0.id}]`);
  await src.scrollIntoViewIfNeeded();
  const n = await rows.count();
  const tgt = rows.nth(n - 8);
  const sb = await src.boundingBox(), tb = await tgt.boundingBox();
  await p.mouse.move(sb.x + 60, sb.y + sb.height / 2); await p.mouse.down();
  await p.mouse.move(tb.x + 60, tb.y + 4, { steps: 12 }); await p.mouse.up();
  d = await draft();
  console.log('target was', await tgt.innerText());
  console.log('order after drag up', order(d).slice(-12));
  // drag a plain layer onto the group header → joins the group
  const gb = await src.boundingBox();
  const plainRow = rows.nth(n - 1);
  const pb = await plainRow.boundingBox();
  await p.mouse.move(pb.x + 60, pb.y + pb.height / 2); await p.mouse.down();
  await p.mouse.move(gb.x + 60, gb.y + gb.height * 0.75, { steps: 12 }); await p.mouse.up();
  d = await draft();
  console.log('after drop into group', order(d).slice(-12));
  await p.screenshot({ path: out + '/l3-order.png' });
  // canvas right click on a layer
  console.log(JSON.stringify(errs));
  await b.close();
})();
