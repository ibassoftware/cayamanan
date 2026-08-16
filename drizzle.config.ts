import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const connectionString =
  process.env.MIGRATE_TARGET === 'test' ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL (or TEST_DATABASE_URL with --test) is not set');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/modules/org/schema.ts',
    './src/modules/identity/schema.ts',
    './src/modules/employee/schema.ts',
    './src/modules/ai/schema.ts',
    './src/platform/schema/audit.ts',
    './src/platform/schema/settings.ts',
  ],
  out: './drizzle',
  dbCredentials: { url: connectionString },
  // Mastra owns 37 `mastra_*` tables in this same database/schema — never let
  // drizzle-kit introspect, push to, or otherwise manage them.
  tablesFilter: ['!mastra_*'],
});
