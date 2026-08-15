import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { noRawDbAccessOptions, noRestrictedImportsOptions } from '../eslint-rules/no-raw-db-access.mjs';

// Proves the guard in eslint.config.mjs (00-overview.md §4.8: no raw `db.` use inside
// src/modules/**) is real: a fixture that uses it must fail, and the actual module
// files must pass. Both runs use the exact rule config the real eslint.config.mjs
// applies, imported from the same shared module — no drift between "what's tested" and
// "what's enforced".
//
// The name-based `no-restricted-syntax` selector alone is *not* the enforcement
// boundary — it only catches the exact `db` identifier convention. The
// `no-restricted-imports` rule is what actually can't be defeated by renaming the
// variable a raw handle is bound to.
function buildLinter() {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.ts'],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parser: tsParser,
      },
      rules: {
        'no-restricted-syntax': ['error', ...noRawDbAccessOptions],
        'no-restricted-imports': ['error', noRestrictedImportsOptions],
      },
    },
  });
}

describe('src/modules/** may not use a raw db handle', () => {
  it('fails a fixture that calls db.<method> directly', async () => {
    const eslint = buildLinter();
    const results = await eslint.lintText(
      [
        "import { getBootstrapDb } from '@/platform/db';",
        '',
        'export async function bad() {',
        '  const db = getBootstrapDb();',
        "  return db.select().from('tenants');",
        '}',
        '',
      ].join('\n'),
      { filePath: 'src/modules/fixture/bad-direct-db-access.ts' },
    );

    const messages = results.flatMap((result) => result.messages);
    expect(messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('still fails when the raw handle is bound to a renamed variable (the syntax rule alone would miss this)', async () => {
    const eslint = buildLinter();
    const results = await eslint.lintText(
      [
        "import { getBootstrapDb } from '@/platform/db';",
        '',
        'export async function bad() {',
        '  const raw = getBootstrapDb();',
        "  return raw.execute('select 1');",
        '}',
        '',
      ].join('\n'),
      { filePath: 'src/modules/fixture/bad-renamed-db-access.ts' },
    );

    const messages = results.flatMap((result) => result.messages);
    // The renamed variable defeats the selector-based syntax rule (no `db.` member
    // expression exists in this fixture) but must still fail via the import ban.
    expect(messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false);
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('fails a fixture that constructs a raw Pool/drizzle(...) directly instead of importing getBootstrapDb', async () => {
    const eslint = buildLinter();
    const results = await eslint.lintText(
      [
        "import { Pool } from 'pg';",
        "import { drizzle } from 'drizzle-orm/node-postgres';",
        '',
        'export async function bad() {',
        "  const pool = new Pool({ connectionString: process.env.DATABASE_URL });",
        '  const conn = drizzle(pool);',
        "  return conn.execute('select 1');",
        '}',
        '',
      ].join('\n'),
      { filePath: 'src/modules/fixture/bad-raw-pool-construction.ts' },
    );

    const messages = results.flatMap((result) => result.messages);
    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toHaveLength(2);
  });

  it('passes the real action files under src/modules/**, which only use ctx.db', async () => {
    const eslint = buildLinter();
    const results = await eslint.lintFiles(['src/modules/**/*.ts']);

    const violations = results.flatMap((result) =>
      result.messages.filter((m) => m.ruleId === 'no-restricted-syntax' || m.ruleId === 'no-restricted-imports'),
    );
    expect(violations).toEqual([]);
  });
});
