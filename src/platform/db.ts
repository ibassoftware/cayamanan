import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as orgSchema from '@/modules/org/schema';
import * as identitySchema from '@/modules/identity/schema';
import * as auditSchema from './schema/audit';
import * as settingsSchema from './schema/settings';

const schema = { ...orgSchema, ...identitySchema, ...auditSchema, ...settingsSchema };

export type ScopedDb = NodePgDatabase<typeof schema>;

export interface TenantScope {
  tenantId: string;
  companyId: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Lazily-created pools, read from env at first use (not at module load) so tests can
// point APP_DATABASE_URL / DATABASE_URL at a dedicated test database before the first
// call. See vitest.setup.ts.
let appPool: Pool | undefined;

function getAppPool(): Pool {
  if (!appPool) {
    appPool = new Pool({ connectionString: requireEnv('APP_DATABASE_URL') });
  }
  return appPool;
}

export interface TenantContextOptions {
  /**
   * Explicit, greppable escape hatch for genuine tenant-wide, multi-company reads (e.g.
   * cross-company reporting). Never infer this from an unset/absent companyId — an
   * unset company context must keep failing closed (see the `company_isolation` RLS
   * policy in drizzle/0003_company_isolation_rls.sql). This only relaxes the
   * company_id predicate; tenant scoping is never affected. Defaults to `false`, so
   * every caller that needs cross-company visibility has to say so at the call site,
   * making it visible in code review — grep `crossCompanyReporting` to find every use.
   */
  crossCompanyReporting?: boolean;
}

/**
 * Runs `fn` inside a single Postgres transaction with `app.tenant_id` / `app.company_id`
 * / `app.cross_company_reporting` set via transaction-scoped `set_config` (`is_local =
 * true`). RLS policies on every tenant-scoped table key off `app.tenant_id`; the
 * company-scoped tables (`audit_logs`, `system_settings`) additionally key off
 * `app.company_id` (narrowed further, unless `crossCompanyReporting` is set, by
 * `app.cross_company_reporting`) — so every read/write inside `fn` is confined to the
 * given tenant + company — enforced by Postgres, not just application code.
 *
 * This connects through `APP_DATABASE_URL`, an unprivileged, non-superuser Postgres role
 * with no BYPASSRLS. This is the ONLY sanctioned way for `src/modules/**` to touch the
 * database — direct `db.`/pool use there is forbidden by lint (see eslint.config.mjs).
 */
export async function withTenantContext<T>(
  scope: TenantScope,
  fn: (db: ScopedDb) => Promise<T>,
  options: TenantContextOptions = {},
): Promise<T> {
  const pool = getAppPool();
  const db = drizzle(pool, { schema });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${scope.tenantId}, true)`);
    await tx.execute(sql`select set_config('app.company_id', ${scope.companyId}, true)`);
    await tx.execute(
      sql`select set_config('app.cross_company_reporting', ${options.crossCompanyReporting ? 'on' : 'off'}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Runs `fn` with only `app.tenant_id` set — `app.company_id`/`app.cross_company_reporting`
 * are deliberately left unset, so any company-scoped table (audit_logs, system_settings,
 * and anything future under the `company_isolation` RESTRICTIVE policy) fails closed to
 * zero rows here, by the same `current_setting(..., true) IS NULL` semantics as an unset
 * context in `withTenantContext` above.
 *
 * Exists ONLY for the narrow "tenant known, company not yet known" window inside session
 * resolution (`src/modules/identity/service/session.ts`): once the pre-tenant lookup
 * (see `lookupUserByEmailForAuth`/`lookupSessionForAuth` below) has told us which tenant a
 * user/session belongs to, but before we've read the user row that tells us their
 * `company_id`, we still need an RLS-scoped (not superuser) way to read `users`/
 * `user_roles` — both tenant-scoped tables with no company_id predicate (see
 * drizzle/0004_identity_auth.sql for why). Do not use this for anything else.
 */
export async function withTenantOnlyContext<T>(
  tenantId: string,
  fn: (db: ScopedDb) => Promise<T>,
): Promise<T> {
  const pool = getAppPool();
  const db = drizzle(pool, { schema });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Runs `fn` with NO `app.*` config set at all — every RLS-protected table therefore
 * fails closed to zero rows (same `current_setting(..., true) IS NULL` semantics as an
 * unset tenant/company). Exists only for `login_attempts` (src/modules/identity/schema.ts):
 * it has no `tenant_id` column and no RLS policy (an unknown email is a valid, expected
 * login attempt, so it cannot be tenant-scoped by construction), but still needs a
 * non-superuser connection to insert into. Do not reach for this anywhere else — if a
 * table needs scoping, it needs `withTenantContext`/`withTenantOnlyContext`, not this.
 */
export async function withNoTenantContext<T>(fn: (db: ScopedDb) => Promise<T>): Promise<T> {
  const pool = getAppPool();
  const db = drizzle(pool, { schema });
  return db.transaction(fn);
}

// Administrative bootstrap connection using the privileged DATABASE_URL role (the same
// superuser that runs migrations). Bypasses RLS entirely. Intended ONLY for
// `scripts/seed.ts` and tests that need to arrange fixtures outside any tenant context —
// never import this from `src/modules/**` (enforced by lint).
let bootstrapPool: Pool | undefined;

export function getBootstrapDb(): ScopedDb {
  if (!bootstrapPool) {
    bootstrapPool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  }
  return drizzle(bootstrapPool, { schema });
}

// --- Pre-tenant-context auth lookups (see docs/plan/02-identity-auth.md "the hard
// problem") -----------------------------------------------------------------------
//
// Login (only an email) and session-cookie resolution (only a session id) both need to
// read `users`/`sessions` *before* `app.tenant_id` can be set — there is no tenant
// context yet to scope a normal `withTenantContext` query with, and using the superuser
// `getBootstrapDb()` pool for this would reintroduce a full RLS bypass on the hottest
// path in the app (every request).
//
// Instead, two Postgres functions (`auth_find_user_by_email`, `auth_find_session`,
// defined in drizzle/0004_identity_auth.sql) are `SECURITY DEFINER`, owned by the
// migration/superuser role, and so run with that role's implicit RLS bypass — but ONLY
// for the exact fixed query each function body contains (a single parameterized SELECT
// of a few non-sensitive-beyond-password-hash columns, no dynamic SQL). Postgres grants
// `EXECUTE` on them to `cayamanan_app` and nothing else — `cayamanan_app` cannot read
// `users`/`sessions` any other way without a tenant context set. This keeps the bypass
// narrow, explicit and greppable (search these two function names) rather than a
// general-purpose escape hatch: it is exactly the two lookups this problem requires,
// not a raw connection any module could reach for.
//
// Both queries run through the unprivileged `APP_DATABASE_URL` pool (never
// `getBootstrapDb`) — the bypass lives entirely inside the two function definitions in
// the database, not in the connection used to call them.
export interface AuthUserLookupRow {
  id: string;
  tenantId: string;
  companyId: string;
  email: string;
  name: string;
  passwordHash: string;
  status: string;
  mustChangePassword: boolean;
}

/**
 * Looks up a user by email with no tenant context — used only by `identity.login`
 * before the tenant is known. Returns every row matching the email (should be at most
 * one; MVP enforces single-tenant operation elsewhere, so more than one is an anomaly
 * the caller must treat as "no match", never resolve ambiguously).
 */
export async function lookupUserByEmailForAuth(email: string): Promise<AuthUserLookupRow[]> {
  const pool = getAppPool();
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    company_id: string;
    email: string;
    name: string;
    password_hash: string;
    status: string;
    must_change_password: boolean;
  }>('select * from auth_find_user_by_email($1)', [email]);
  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    companyId: row.company_id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    status: row.status,
    mustChangePassword: row.must_change_password,
  }));
}

export interface AuthSessionLookupRow {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Looks up a session by id with no tenant context — used only when resolving the
 * session cookie on every request, before the tenant is known. Never returns
 * password/PII columns (`sessions` doesn't carry any).
 */
export async function lookupSessionForAuth(sessionId: string): Promise<AuthSessionLookupRow[]> {
  const pool = getAppPool();
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>('select * from auth_find_session($1)', [sessionId]);
  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }));
}

export { schema };
