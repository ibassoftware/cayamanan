import 'dotenv/config';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Migrations always run as the privileged DATABASE_URL role (drizzle-kit / this
// script), never through APP_DATABASE_URL. Pass MIGRATE_TARGET=test to migrate the
// dedicated test database instead (see vitest.setup.ts / package.json "db:migrate:test").
const target = process.env.MIGRATE_TARGET === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
const connectionString = process.env[target];

if (!connectionString) {
  throw new Error(`Missing required environment variable: ${target}`);
}

async function main() {
  const pool = new Pool({ connectionString });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log(`Migrations applied (${target}).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
