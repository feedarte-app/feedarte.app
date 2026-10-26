import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { env } from '../env';
import * as schema from './schema';

export const sqlClient = postgres(env.databaseUrl, {
  max: Number(process.env.DB_POOL ?? 10),
  idle_timeout: 30,
  onnotice: () => {},
});
export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
export { schema };

function findMigrations(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve('drizzle'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle'),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(path.join(c, 'meta'))) return c;
  throw new Error('migrations folder not found');
}

export async function runMigrations() {
  // advisory lock so api + workers starting together don't race
  await sqlClient`select pg_advisory_lock(727001)`;
  try {
    await migrate(db, { migrationsFolder: findMigrations() });
  } finally {
    await sqlClient`select pg_advisory_unlock(727001)`;
  }
}
