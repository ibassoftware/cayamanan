import { config } from 'dotenv';

config();

// Tests never touch the dev database — everything routes through the dedicated test
// database (see .env.example, package.json "db:migrate:test"/"test"). Overriding these
// here (before any test file imports src/platform/db.ts) works because db.ts creates
// its pools lazily, reading process.env at first use, not at module load.
if (!process.env.TEST_DATABASE_URL || !process.env.TEST_APP_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL and TEST_APP_DATABASE_URL must be set (see .env.example). Tests run against a dedicated test database, never the dev database.',
  );
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_DATABASE_URL = process.env.TEST_APP_DATABASE_URL;

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set (see .env.example) — the session cookie tests need it.');
}
