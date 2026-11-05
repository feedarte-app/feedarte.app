import { createCanvas } from '@napi-rs/canvas';
import { registerFonts } from '../../src/server/render/engine';
import { layoutText } from '../../src/shared/render';
import { makeText } from '../../src/shared/layers';
registerFonts();
const g = createCanvas(10, 10).getContext('2d') as any;
const base = makeText({ text: '', x: 0, y: 0, w: 200, h: 120, size: 40, font: 'Nunito', maxLines: 2, autoFit: true, align: 'center' } as any);
for (const t of ['Спідниця-шорти червона', 'Сорочка оверсайз біла', 'Кардиган', 'Сукня-сорочка міді з поясом бежева', 'Костюм спортивний трикотажний оверсайз']) {
  for (const aw of [false, true]) {
    const r = layoutText(g, { ...base, autoWidth: aw } as any, t);
    console.log(aw ? 'AW' : '  ', r.size, JSON.stringify(r.lines), Math.round(r.boxW));
  }
}
