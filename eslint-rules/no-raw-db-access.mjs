// Shared by eslint.config.mjs (real enforcement, scoped to src/modules/**) and
// tests/eslint-db-restriction.test.ts (proves the rule actually fires). Keeping the
// rule options in one place means the test can't drift from what's really enforced.
//
// The real boundary is import-based (`noRestrictedImportsOptions` below): it forbids
// src/modules/** from importing `getBootstrapDb` from `@/platform/db`, or constructing a
// raw connection via `pg`'s `Pool` / `drizzle-orm/node-postgres`'s `drizzle(...)`. This
// cannot be defeated by renaming the resulting variable (`const raw = getBootstrapDb()`
// still fails), unlike a name-based syntax rule.
//
// `noRawDbAccessOptions` (selector-based, matches a bare `db.<member>` / `db(...)`) is
// kept as belt-and-braces on top of the import ban — it happens to catch the common
// naming convention early/readably, but it is NOT the enforcement boundary by itself.
export const noRawDbAccessMessage =
  'Direct `db.` use is forbidden in src/modules/**. Use `ctx.db` inside an action handler (the transaction-scoped handle from withTenantContext), never a raw db/pool import.';

export const noRawDbAccessOptions = [
  { selector: "MemberExpression[object.name='db']", message: noRawDbAccessMessage },
  { selector: "CallExpression[callee.name='db']", message: noRawDbAccessMessage },
];

const noRestrictedImportMessage =
  '`getBootstrapDb` (and raw `Pool`/`drizzle(...)` construction) is forbidden in src/modules/**, ' +
  'under any local name. Use `withTenantContext` from `@/platform/db` instead — it is the only ' +
  'RLS-scoped, non-superuser way to touch the database from a module.';

// A single options object for ESLint's built-in `no-restricted-imports` rule. Blocks the
// *import*, not the identifier name it's bound to, so `const raw = getBootstrapDb()` is
// caught exactly like `const db = getBootstrapDb()`.
export const noRestrictedImportsOptions = {
  paths: [
    {
      name: '@/platform/db',
      importNames: ['getBootstrapDb'],
      message: noRestrictedImportMessage,
    },
    {
      name: 'pg',
      importNames: ['Pool'],
      message: noRestrictedImportMessage,
    },
    {
      name: 'drizzle-orm/node-postgres',
      importNames: ['drizzle'],
      message: noRestrictedImportMessage,
    },
  ],
};
