CREATE TABLE "onboarding_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "employee_documents" DROP CONSTRAINT "employee_documents_requirement_id_matches_kind";--> statement-breakpoint
ALTER TABLE "employee_documents" ADD COLUMN "document_type" text;--> statement-breakpoint
CREATE INDEX "onboarding_templates_tenant_company_idx" ON "onboarding_templates" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_templates_tenant_company_name_uidx" ON "onboarding_templates" USING btree ("tenant_id","company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_templates_one_default_per_company_uidx" ON "onboarding_templates" USING btree ("tenant_id","company_id") WHERE "onboarding_templates"."is_default" = true;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_kind_shape_check" CHECK (("employee_documents"."kind" = 'PHOTO' AND "employee_documents"."requirement_id" IS NULL AND "employee_documents"."document_type" IS NULL)
        OR ("employee_documents"."kind" = 'REQUIREMENT' AND "employee_documents"."requirement_id" IS NOT NULL AND "employee_documents"."document_type" IS NULL)
        OR ("employee_documents"."kind" = 'GENERAL' AND "employee_documents"."requirement_id" IS NULL AND "employee_documents"."document_type" IS NOT NULL));
--> statement-breakpoint

-- Grant for the unprivileged application role (see drizzle/0001_enable_rls_and_app_role.sql)
-- — full DML, same as every other employee_*/org reference table.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE onboarding_templates TO cayamanan_app;
--> statement-breakpoint

-- RLS: same tenant_isolation (PERMISSIVE) + company_isolation (RESTRICTIVE) shape as every
-- other tenant/company-scoped table — fail-closed to zero rows with no tenant/company
-- context set for the transaction.
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE onboarding_templates FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON onboarding_templates
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON onboarding_templates AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );

-- Rollback: DROP TABLE onboarding_templates CASCADE; ALTER TABLE employee_documents DROP
-- CONSTRAINT employee_documents_kind_shape_check, DROP COLUMN document_type, then re-add
-- employee_documents_requirement_id_matches_kind CHECK ((kind = 'PHOTO' AND requirement_id
-- IS NULL) OR (kind = 'REQUIREMENT' AND requirement_id IS NOT NULL)). Large-table impact:
-- onboarding_templates is new and starts empty (no backfill). document_type is a nullable
-- column add on employee_documents — a metadata-only change in Postgres 11+, no table
-- rewrite, safe regardless of existing row count; every existing row has kind IN ('PHOTO',
-- 'REQUIREMENT') with document_type NULL, which already satisfies the new CHECK (PHOTO/
-- REQUIREMENT branches are unchanged other than requiring document_type IS NULL, true for
-- every pre-existing row), so the constraint validation Postgres runs while adding it does
-- not require a backfill and cannot fail on existing data.