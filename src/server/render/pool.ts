// Tiny worker_threads pool for CPU-bound rendering.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { ResolvedDesign } from '../../shared/render';
import { renderToStorage, type RenderResult } from './engine';
import { log } from '../log';

type Task = { resolved: ResolvedDesign; ext: 'jpg' | 'png'; quality: number; key: string };
type Pending = { resolve: (r: RenderResult) => void; task: Task };

const here = path.dirname(fileURLToPath(import.meta.url));

function threadEntry(): { file: string; execArgv: string[] } | null {
  // production bundle: dist/server/render/thread.js (pool is bundled into dist/server/*.js)
  for (const js of [path.join(here, 'render', 'thread.js'), path.join(here, 'thread.js')]) if (fs.existsSync(js)) return { file: js, execArgv: [] };
  const ts = path.join(here, 'thread.ts'); // dev (tsx)
  if (fs.existsSync(ts)) return { file: ts, execArgv: ['--import', 'tsx'] };
  return null;
}

export const RENDER_THREADS = Math.max(
  0,
  Number(process.env.RENDER_THREADS ?? Math.min(8, Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1))),
);

class Pool {
  private workers: { w: Worker; busy: number | null }[] = [];
  private queue: { id: number; task: Task }[] = [];
  private pending = new Map<number, Pending>();
  private seq = 0;
  private disabled = false;
  private closing = false;

  private spawn() {
    const entry = threadEntry();
    if (!entry || RENDER_THREADS === 0) {
      this.disabled = true;
      return;
    }
    const w = new Worker(entry.file, { execArgv: entry.execArgv });
    const slot = { w, busy: null as number | null };
    w.on('message', (m: { id: number; result: RenderResult; error?: string }) => {
      const p = this.pending.get(m.id);
      this.pending.delete(m.id);
      slot.busy = null;
      if (m.error) log.warn({ err: m.error }, 'render thread error');
      p?.resolve(m.result);
      this.pump();
    });
    let dead = false;
    const onDeath = (e: unknown) => {
      if (dead) return;
      dead = true;
      log.error({ err: String(e) }, 'render thread crashed');
      if (slot.busy != null) {
        const p = this.pending.get(slot.busy);
        this.pending.delete(slot.busy);
        p?.resolve({ ok: false, reason: 'Процес рендеру аварійно завершився' });
      }
      this.workers = this.workers.filter((x) => x !== slot);
      this.spawn();
      this.pump();
    };
    w.on('error', onDeath);
    w.on('exit', (code) => {
      if (!this.closing) onDeath(new Error(`render thread exited (${code})`));
    });
    this.workers.push(slot);
  }

  private ensure() {
    if (this.disabled) return;
    while (this.workers.length < RENDER_THREADS && !this.disabled) this.spawn();
  }

  private pump() {
    for (const slot of this.workers) {
      if (slot.busy != null) continue;
      const next = this.queue.shift();
      if (!next) return;
      slot.busy = next.id;
      slot.w.postMessage({ id: next.id, ...next.task });
    }
  }

  run(task: Task): Promise<RenderResult> {
    this.ensure();
    if (this.disabled) return renderToStorage(task.resolved, task.ext, task.quality, task.key).catch((e) => ({ ok: false as const, reason: `Помилка рендеру: ${e instanceof Error ? e.message : e}` }));
    const id = ++this.seq;
    return new Promise<RenderResult>((resolve) => {
      this.pending.set(id, { resolve, task });
      this.queue.push({ id, task });
      this.pump();
    });
  }

  get size() {
    return this.disabled ? 1 : RENDER_THREADS;
  }

  async close() {
    this.closing = true;
    await Promise.all(this.workers.map((s) => s.w.terminate()));
    this.workers = [];
  }
}

export const renderPool = new Pool();
