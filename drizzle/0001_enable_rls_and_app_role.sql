-- Unprivileged application role + row-level security baseline (00-overview.md §4.8).
--
-- `cayamanan_app` is NOSUPERUSER / NOBYPASSRLS and only ever gets DML grants on the
-- app's own tables below — no DDL, no ownership. All application runtime queries go
-- through APP_DATABASE_URL (this role); migrations always run as the superuser role
-- via DATABASE_URL. This statement is idempotent (safe to run against multiple
-- databases in the same cluster, since Postgres roles are cluster-wide).
--
-- Local dev credential only (mirrors the existing cayamanan/cayamanan pattern in
-- docker-compose.yml) — not a production secret.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cayamanan_app') THEN
    CREATE ROLE cayamanan_app WITH LOGIN PASSWORD 'cayamanan_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO cayamanan_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenants TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE companies TO cayamanan_app;
--> statement-breakpoint
-- audit_logs is append-only: no UPDATE/DELETE grant, ever.
GRANT SELECT, INSERT ON TABLE audit_logs TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE system_settings TO cayamanan_app;
--> statement-breakpoint

-- RLS: `current_setting(..., true)` returns NULL (not an error) when app.tenant_id
-- hasn't been set for the session/transaction, which fails closed — zero rows, rather
-- than throwing, if a query somehow runs outside withTenantContext().
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON companies
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE system_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON system_settings
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
