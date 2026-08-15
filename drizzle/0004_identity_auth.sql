CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent_hash" text
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_email_hash_at_idx" ON "login_attempts" USING btree ("email_hash","at");--> statement-breakpoint
CREATE INDEX "sessions_tenant_user_idx" ON "sessions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "sessions_tenant_id_idx" ON "sessions" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "user_roles_tenant_user_idx" ON "user_roles" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_uidx" ON "user_roles" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "users_tenant_company_idx" ON "users" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_uidx" ON "users" USING btree ("tenant_id","email");
--> statement-breakpoint

-- Grants for the unprivileged application role (see drizzle/0001_enable_rls_and_app_role.sql).
-- login_attempts is append-only like audit_logs: no UPDATE/DELETE.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_roles TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sessions TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE login_attempts TO cayamanan_app;
--> statement-breakpoint

-- RLS: tenant-only isolation on users/user_roles/sessions (see src/modules/identity/schema.ts
-- for why these do NOT also get the company_isolation RESTRICTIVE policy from
-- drizzle/0003_company_isolation_rls.sql — it would make "find the user for this
-- session" impossible before the company is known). login_attempts has no tenant_id
-- column at all (see schema.ts) and gets no RLS.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON user_roles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sessions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint

-- --------------------------------------------------------------------------------
-- Pre-tenant-context auth lookups (docs/plan/02-identity-auth.md "the hard problem",
-- see src/platform/db.ts lookupUserByEmailForAuth/lookupSessionForAuth for the callers
-- and the full design rationale).
--
-- Login (only an email) and every request's session-cookie check (only a session id)
-- both need to read these tables before `app.tenant_id` can be set — RLS fails closed
-- to zero rows with no tenant context, and there is no tenant to set yet at that point.
-- Rather than routing these two reads through the superuser bootstrap connection (which
-- would reintroduce a full RLS bypass on the hottest path in the app), each gets its own
-- `SECURITY DEFINER` function: owned by the migration (superuser) role, so it runs with
-- that role's implicit RLS bypass, but ONLY for the single fixed, parameterized SELECT
-- each function body contains — no dynamic SQL, no caller-supplied predicate. `EXECUTE`
-- is granted to `cayamanan_app` and REVOKEd from everyone else, so the unprivileged role
-- that every other query in the app runs as can reach exactly these two lookups and
-- nothing else — the blast radius is these two function bodies, not a bypassable
-- connection. `SET search_path = public, pg_temp` pins name resolution so this can't be
-- hijacked by a search_path change.
CREATE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  company_id uuid,
  email text,
  name text,
  password_hash text,
  status text,
  must_change_password boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, tenant_id, company_id, email, name, password_hash, status, must_change_password
  FROM users
  WHERE email = p_email;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_find_user_by_email(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO cayamanan_app;
--> statement-breakpoint

CREATE FUNCTION auth_find_session(p_session_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, tenant_id, user_id, expires_at, revoked_at
  FROM sessions
  WHERE id = p_session_id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_find_session(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_find_session(uuid) TO cayamanan_app;

-- Rollback: DROP FUNCTION auth_find_user_by_email(text); DROP FUNCTION
-- auth_find_session(uuid); DROP TABLE login_attempts, sessions, user_roles, users
-- (children first, respecting the FKs above) — no other existing table/policy/grant is
-- touched by this migration.