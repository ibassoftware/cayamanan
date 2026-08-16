CREATE TABLE "employee_education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"level" text NOT NULL,
	"school" text NOT NULL,
	"degree" text,
	"field_of_study" text,
	"start_year" integer,
	"end_year" integer,
	"honors" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "employee_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"requirement" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"submitted_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "employee_training" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"provider" text,
	"start_date" date,
	"end_date" date,
	"hours" numeric(8, 2),
	"certificate_no" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "employee_work_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"employer" text NOT NULL,
	"position" text,
	"start_date" date,
	"end_date" date,
	"reason_for_leaving" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "employee_contacts" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "employee_contacts" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "employee_contacts" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "employee_contacts" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "permanent_address" jsonb;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "birth_place" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "religion" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "blood_type" text;--> statement-breakpoint
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_requirements" ADD CONSTRAINT "employee_requirements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_training" ADD CONSTRAINT "employee_training_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_history" ADD CONSTRAINT "employee_work_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_education_tenant_company_employee_idx" ON "employee_education" USING btree ("tenant_id","company_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_requirements_tenant_company_employee_idx" ON "employee_requirements" USING btree ("tenant_id","company_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_requirements_tenant_company_employee_requirement_uidx" ON "employee_requirements" USING btree ("tenant_id","company_id","employee_id","requirement");--> statement-breakpoint
CREATE INDEX "employee_training_tenant_company_employee_idx" ON "employee_training" USING btree ("tenant_id","company_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_work_history_tenant_company_employee_idx" ON "employee_work_history" USING btree ("tenant_id","company_id","employee_id");--> statement-breakpoint

-- Grants for the unprivileged application role (see drizzle/0001_enable_rls_and_app_role.sql).
-- Every new table gets full DML — none of them are append-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employee_education TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employee_work_history TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employee_training TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employee_requirements TO cayamanan_app;
--> statement-breakpoint

-- RLS: same tenant_isolation (PERMISSIVE) + company_isolation (RESTRICTIVE) shape as
-- every other employee_* table (drizzle/0006_organization_employee_master_data.sql) —
-- fail-closed to zero rows with no tenant/company context set for the transaction.
ALTER TABLE employee_education ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_education FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employee_education
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON employee_education AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE employee_work_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_work_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employee_work_history
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON employee_work_history AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE employee_training ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_training FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employee_training
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON employee_training AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE employee_requirements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_requirements FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employee_requirements
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON employee_requirements AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );

-- Rollback: DROP TABLE employee_education, employee_work_history, employee_training,
-- employee_requirements CASCADE; ALTER TABLE employee_contacts DROP COLUMN is_primary,
-- DROP COLUMN birth_date, DROP COLUMN address, DROP COLUMN email; ALTER TABLE employees
-- DROP COLUMN blood_type, DROP COLUMN religion, DROP COLUMN nationality, DROP COLUMN
-- birth_place, DROP COLUMN permanent_address; — all new employees/employee_contacts
-- columns are nullable (or, for employee_contacts.is_primary, defaulted) additions, so no
-- backfill is required on either existing table and this is safe on a large employees/
-- employee_contacts table (no table rewrite: a nullable/defaulted column add is a
-- metadata-only change in Postgres 11+). No existing row/policy/grant on any other table
-- is touched by this migration.