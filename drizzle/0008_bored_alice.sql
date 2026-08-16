CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"requirement_id" uuid,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "employee_documents_requirement_id_matches_kind" CHECK (("employee_documents"."kind" = 'PHOTO' AND "employee_documents"."requirement_id" IS NULL) OR ("employee_documents"."kind" = 'REQUIREMENT' AND "employee_documents"."requirement_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_requirement_id_employee_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."employee_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_documents_tenant_company_employee_idx" ON "employee_documents" USING btree ("tenant_id","company_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_documents_one_photo_per_employee_uidx" ON "employee_documents" USING btree ("tenant_id","company_id","employee_id") WHERE "employee_documents"."kind" = 'PHOTO';
--> statement-breakpoint

-- Grant for the unprivileged application role (see drizzle/0001_enable_rls_and_app_role.sql)
-- — full DML, same as every other employee_* table.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employee_documents TO cayamanan_app;
--> statement-breakpoint

-- RLS: same tenant_isolation (PERMISSIVE) + company_isolation (RESTRICTIVE) shape as every
-- other employee_* table (drizzle/0006_organization_employee_master_data.sql) — fail-closed
-- to zero rows with no tenant/company context set for the transaction. This is what makes
-- GET /api/files/[documentId] (src/modules/employee/service/resolve-document-for-download.ts)
-- safe to load through a plain `withTenantContext` select: a document belonging to another
-- tenant/company simply is not a row Postgres will return here, regardless of what the
-- caller's application code does or forgets to check.
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employee_documents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON employee_documents AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );

-- Rollback: DROP TABLE employee_documents CASCADE; — a brand-new table with no data yet
-- to preserve, so no backfill and no impact on any other table's rows/policies/grants.
-- Large-table impact: none (new table, starts empty). One caution for the future: this
-- table stores file bytes directly in rows (bytea), so unlike the other 201-file child
-- tables its row sizes will be materially larger — worth keeping an eye on table/ index
-- bloat once real uploads accumulate, but not a concern at MVP volumes and not a reason to
-- change the storage decision documented in schema.ts.