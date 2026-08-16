CREATE TABLE "chat_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE INDEX "chat_attachments_tenant_company_user_idx" ON "chat_attachments" USING btree ("tenant_id","company_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_expires_at_idx" ON "chat_attachments" USING btree ("expires_at");
--> statement-breakpoint

-- Grant for the unprivileged application role (see drizzle/0001_enable_rls_and_app_role.sql).
-- Full DML: ai.createAttachment inserts, deleteExpiredAttachments deletes, and there is no
-- update path (a staged attachment is write-once — nothing in this slice ever mutates one
-- in place).
GRANT SELECT, INSERT, DELETE ON TABLE chat_attachments TO cayamanan_app;
--> statement-breakpoint

-- RLS: same tenant_isolation (PERMISSIVE) + company_isolation (RESTRICTIVE) shape as every
-- other tenant-scoped table (drizzle/0003_company_isolation_rls.sql,
-- drizzle/0008_bored_alice.sql) — fail-closed to zero rows with no tenant/company context
-- set for the transaction. RLS only ever narrows to tenant_id/company_id; row ownership
-- (user_id) and the 1-hour TTL (expires_at) are enforced in application code
-- (src/modules/ai/service/attachments.ts), same as employee_documents' employee-level
-- ownership check in resolve-document-for-download.ts.
ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_attachments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON chat_attachments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON chat_attachments AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );

-- Rollback: DROP TABLE chat_attachments CASCADE; — a brand-new table with no data yet to
-- preserve, so no backfill and no impact on any other table's rows/policies/grants.
-- Large-table impact: none at MVP volumes (rows self-expire in an hour and are reaped
-- opportunistically); worth revisiting only if attachment volume ever grows enough that
-- the lack of a real scheduler leaves a meaningful number of expired rows accumulating
-- between ai.createAttachment calls.