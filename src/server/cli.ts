import { eq } from 'drizzle-orm';
import { db, schema, runMigrations, sqlClient } from './db';
import { hashPassword } from './auth';

const [cmd, email, password] = process.argv.slice(2);
async function main() {
  await runMigrations();
  if (cmd === 'create-admin') {
    if (!email || !password || password.length < 8) throw new Error('usage: create-admin <email> <password(min 8)>');
    const e = email.toLowerCase();
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, e) });
    const passwordHash = await hashPassword(password);
    if (existing) await db.update(schema.users).set({ role: 'admin', status: 'active', passwordHash }).where(eq(schema.users.id, existing.id));
    else await db.insert(schema.users).values({ email: e, name: 'Admin', role: 'admin', status: 'active', passwordHash });
    console.log(`admin ready: ${e}`);
  } else console.log('commands: create-admin <email> <password>');
  await sqlClient.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
