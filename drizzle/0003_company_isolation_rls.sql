-- Company-level Row-Level Security: defence in depth beyond app.tenant_id (see
-- docs/plan/01-foundation.md and drizzle/0001_enable_rls_and_app_role.sql). Isolation
-- currently rests entirely on every handler remembering a `WHERE company_id = …`
-- clause; this adds a DB-enforced backstop, the same reasoning already applied to
-- tenant_id.
--
-- Per-table predicate, considered individually rather than mechanically applied to all
-- four RLS-enabled tables:
--
--   * `tenants` has no company_id column at all — no change, policy stays tenant-only.
--
--   * `companies` is the registry OF companies within a tenant (a company switcher, or
--     any future "list my companies" screen, must be able to enumerate every company in
--     the caller's tenant). Scoping it to a single app.company_id would make it
--     impossible to ever see a sibling company row, which breaks the multi-company model
--     the schema exists to support. So `companies` intentionally does NOT get a
--     company_id predicate — tenant-only scoping (already in place) remains correct here.
--
--   * `audit_logs` and `system_settings` are genuinely company-scoped data (who did what
--     in which company; per-company settings), so they get the new predicate below.
--
-- Postgres combines multiple PERMISSIVE policies for the same command with OR, so a
-- second, narrower PERMISSIVE policy alongside the existing `tenant_isolation` policy
-- would have no effect (tenant_isolation alone would still allow every row in the
-- tenant). RESTRICTIVE policies AND with permissive ones, which is what's needed to
-- actually narrow visibility — so `company_isolation` below is created AS RESTRICTIVE.
--
-- Fail-closed, same convention as tenant_isolation: two-arg current_setting(...) returns
-- NULL (not an error) when app.company_id hasn't been set for the transaction, so an
-- unset context matches zero rows rather than throwing or returning everything.
--
-- Escape hatch: cross-company, tenant-wide reporting is real future product behavior
-- (e.g. a payroll/HR report spanning every company in a tenant). Rather than treating
-- "company context unset" as "all companies" (which would turn the fail-closed default
-- into fail-open), that case gets its own explicit, greppable, opt-in session variable —
-- app.cross_company_reporting — set to 'on' only when a caller passes
-- `{ crossCompanyReporting: true }` to withTenantContext (src/platform/db.ts). Left unset
-- (or 'off'), current_setting(..., true) = 'on' is NULL/false, so the escape hatch is
-- closed by default and only ever opened by an explicit, reviewable call site.
CREATE POLICY company_isolation ON audit_logs AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

CREATE POLICY company_isolation ON system_settings AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );

-- Rollback: DROP POLICY company_isolation ON audit_logs; DROP POLICY company_isolation
-- ON system_settings; — restores exactly the pre-migration tenant-only behavior with no
-- other side effects (no columns, grants, or existing policies touched).
