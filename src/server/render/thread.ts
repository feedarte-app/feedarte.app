// Render worker thread: draws creatives in parallel on all CPU cores.
import { parentPort } from 'node:worker_threads';
import { registerFonts, renderToStorage } from './engine';
import type { ResolvedDesign } from '../../shared/render';

registerFonts();
parentPort!.on('message', async (m: { id: number; resolved: ResolvedDesign; ext: 'jpg' | 'png'; quality: number; key: string }) => {
  try {
    const result = await renderToStorage(m.resolved, m.ext, m.quality, m.key);
    parentPort!.postMessage({ id: m.id, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    parentPort!.postMessage({ id: m.id, result: { ok: false, reason: `Помилка рендеру: ${msg}` }, error: msg });
  }
});
