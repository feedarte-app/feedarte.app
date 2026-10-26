import { env } from './env';
import { runMigrations, sqlClient, db, schema } from './db';
import { claim, complete, fail, heartbeat, pruneJobs, recoverStale, releaseMine, workerId, type Job } from './queue';
import { scheduleDueFeeds, syncFeed } from './feed/sync';
import { renderDesignJob } from './render/job';
import { ensureDirs } from './storage';
import { registerFonts } from './render/engine';
import { log } from './log';
import { eq } from 'drizzle-orm';

let running = 0;
let stopping = false;

async function handle(job: Job) {
  const beat = () => heartbeat(job.id);
  if (job.type === 'sync-feed') await syncFeed(job.payload.feedId, { force: !!job.payload.force, heartbeat: beat });
  else if (job.type === 'render-design') {
    try {
      await renderDesignJob(job.payload.designId, beat);
    } catch (e) {
      await db
        .update(schema.designs)
        .set({ renderStatus: 'error', renderError: e instanceof Error ? e.message : String(e) })
        .where(eq(schema.designs.id, job.payload.designId));
      throw e;
    }
  }
}

async function loop() {
  while (!stopping) {
    if (running >= env.workerConcurrency) {
      await sleep(300);
      continue;
    }
    let job: Job | null = null;
    try {
      job = await claim(['sync-feed', 'render-design']);
    } catch (e) {
      log.error({ err: String(e) }, 'claim failed');
      await sleep(5000);
      continue;
    }
    if (!job) {
      await sleep(1500);
      continue;
    }
    running++;
    const j = job;
    const t0 = Date.now();
    const beat = setInterval(() => heartbeat(j.id).catch(() => {}), 30_000);
    handle(j)
      .then(() => complete(j.id))
      .then(() => log.info({ job: j.id, type: j.type, ms: Date.now() - t0 }, 'job done'))
      .catch(async (e) => {
        log.error({ job: j.id, type: j.type, err: e instanceof Error ? e.message : String(e) }, 'job failed');
        await fail(j, e).catch(() => {});
      })
      .finally(() => {
        clearInterval(beat);
        running--;
      });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function maintenance() {
  // only one worker does scheduling at a time
  try {
    await sqlClient.begin(async (tx) => {
      const [{ locked }] = await tx`select pg_try_advisory_xact_lock(727002) as locked`;
      if (!locked) return;
      const n = await scheduleDueFeeds();
      if (n) log.info({ n }, 'scheduled feeds');
      await recoverStale();
    });
    await sqlClient`insert into settings (key, value) values (${'worker:' + workerId}, ${JSON.stringify({ at: new Date().toISOString(), running })}::jsonb)
      on conflict (key) do update set value = excluded.value`;
    await sqlClient`delete from settings where key like 'worker:%' and (value->>'at')::timestamptz < now() - interval '1 day'`;
  } catch (e) {
    log.error({ err: String(e) }, 'maintenance failed');
  }
}

async function main() {
  ensureDirs();
  await runMigrations();
  registerFonts();
  log.info({ workerId, concurrency: env.workerConcurrency }, 'worker started');
  await maintenance();
  setInterval(maintenance, 30_000);
  setInterval(() => pruneJobs().catch(() => {}), 6 * 3600_000);
  const stop = async () => {
    stopping = true;
    const deadline = Date.now() + 25_000;
    while (running > 0 && Date.now() < deadline) await sleep(500);
    await releaseMine().catch(() => {});
    await sqlClient`delete from settings where key = ${'worker:' + workerId}`.catch(() => {});
    await sqlClient.end({ timeout: 5 });
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  await loop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
