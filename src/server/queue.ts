// Minimal, reliable Postgres-backed job queue (FOR UPDATE SKIP LOCKED).
import os from 'node:os';
import { sqlClient as sql } from './db';

export type JobType = 'sync-feed' | 'render-design';

export interface Job {
  id: number;
  type: JobType;
  payload: Record<string, any>;
  attempts: number;
  max_attempts: number;
  dedupe_key: string | null;
}

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string; priority?: number; delaySec?: number; maxAttempts?: number } = {},
) {
  const rows = await sql`
    insert into jobs (type, payload, dedupe_key, priority, run_after, max_attempts)
    values (${type}, ${JSON.stringify(payload)}::jsonb, ${opts.dedupeKey ?? null}, ${opts.priority ?? 5},
            now() + make_interval(secs => ${opts.delaySec ?? 0}), ${opts.maxAttempts ?? 3})
    on conflict (dedupe_key) where status = 'queued' do nothing
    returning id`;
  return rows[0]?.id as number | undefined;
}

export const workerId = `${os.hostname()}:${process.pid}`;

export async function claim(types: JobType[]): Promise<Job | null> {
  const rows = await sql<Job[]>`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id = (
      select j.id from jobs j
      where j.status = 'queued' and j.run_after <= now() and j.type = any(${types})
        and (j.dedupe_key is null or not exists (
          select 1 from jobs r where r.status = 'running' and r.dedupe_key = j.dedupe_key))
      order by j.priority, j.id
      for update skip locked
      limit 1)
    returning id, type, payload, attempts, max_attempts, dedupe_key`;
  return rows[0] ?? null;
}

export async function complete(id: number) {
  await sql`update jobs set status = 'done', finished_at = now(), locked_at = null where id = ${id}`;
}

export async function fail(job: Job, err: unknown) {
  const msg = err instanceof Error ? `${err.message}` : String(err);
  if (job.attempts < job.max_attempts) {
    const backoff = Math.min(600, 15 * 2 ** job.attempts);
    // if an identical job is already queued, just mark this one failed
    try {
      await sql`update jobs set status = 'queued', locked_at = null, last_error = ${msg},
        run_after = now() + make_interval(secs => ${backoff}) where id = ${job.id}`;
      return;
    } catch {
      /* unique violation: another queued copy exists */
    }
  }
  await sql`update jobs set status = 'failed', finished_at = now(), last_error = ${msg}, locked_at = null where id = ${job.id}`;
}

/** Re-queue jobs whose worker died (no heartbeat for 20 minutes). */
export async function recoverStale() {
  await sql`update jobs set status = 'queued', locked_at = null
    where status = 'running' and locked_at < now() - interval '20 minutes'
    and not exists (select 1 from jobs q where q.status = 'queued' and q.dedupe_key = jobs.dedupe_key)`;
  await sql`update jobs set status = 'failed', finished_at = now(), last_error = 'stale'
    where status = 'running' and locked_at < now() - interval '20 minutes'`;
}

export async function heartbeat(id: number) {
  await sql`update jobs set locked_at = now() where id = ${id} and status = 'running'`;
}

/** Keep the jobs table small. */
export async function pruneJobs() {
  await sql`delete from jobs where status in ('done','failed') and finished_at < now() - interval '7 days'`;
  await sql`delete from sync_runs where started_at < now() - interval '30 days'`;
}
