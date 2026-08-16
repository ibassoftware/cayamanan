CREATE TABLE "ai_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"input_preview" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"action_id" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"error_code" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_confirmations_tenant_company_user_idx" ON "ai_confirmations" USING btree ("tenant_id","company_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_confirmations_expires_at_idx" ON "ai_confirmations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ai_threads_tenant_company_user_idx" ON "ai_threads" USING btree ("tenant_id","company_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_threads_last_message_at_idx" ON "ai_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "ai_tool_invocations_tenant_company_thread_idx" ON "ai_tool_invocations" USING btree ("tenant_id","company_id","thread_id");--> statement-breakpoint
CREATE INDEX "ai_tool_invocations_action_id_idx" ON "ai_tool_invocations" USING btree ("action_id");--> statement-breakpoint

-- Grants for the unprivileged application role (see drizzle/0001_enable_rls_and_app_role.sql).
-- ai_confirmations needs UPDATE to mark a token consumed; ai_threads needs UPDATE/DELETE
-- for rename/last_message_at bumps and thread deletion. ai_tool_invocations is
-- append-only, like audit_logs/login_attempts: it's a metadata trail, never mutated or
-- deleted after the fact.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_threads TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE ai_confirmations TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE ai_tool_invocations TO cayamanan_app;
--> statement-breakpoint

-- RLS: same tenant_isolation + company_isolation RESTRICTIVE shape as audit_logs/
-- system_settings (drizzle/0001_enable_rls_and_app_role.sql,
-- drizzle/0003_company_isolation_rls.sql) — fail-closed to zero rows with no tenant/
-- company context set for the transaction, same current_setting(..., true) semantics.
ALTER TABLE ai_threads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_threads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ai_threads
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON ai_threads AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE ai_confirmations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_confirmations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ai_confirmations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON ai_confirmations AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE ai_tool_invocations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_tool_invocations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ai_tool_invocations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON ai_tool_invocations AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );

-- Rollback: DROP TABLE ai_threads, ai_confirmations, ai_tool_invocations; — no other
-- existing table/policy/grant is touched by this migration.