CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"depth" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "employee_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"relationship" text,
	"mobile" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "employee_government_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"sss_no" text,
	"philhealth_no" text,
	"pagibig_no" text,
	"tin" text,
	"hdmf_mid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_no" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"suffix" text,
	"birth_date" date,
	"sex" text,
	"civil_status" text,
	"email_personal" text,
	"email_work" text,
	"mobile" text,
	"address" jsonb,
	"hire_date" date NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"photo_url" text,
	"department_id" uuid,
	"position_id" uuid,
	"location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_contacts" ADD CONSTRAINT "employee_contacts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_government_ids" ADD CONSTRAINT "employee_government_ids_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The FKs below are hand-added (not drizzle-kit generated): each column's own Drizzle
-- schema.ts deliberately omits `.references()` to avoid a cross-module schema.ts import
-- (00-overview.md §4.1 — see src/modules/employee/schema.ts and
-- src/modules/identity/schema.ts header comments). The constraint itself is still a real
-- DB-level FK; application code additionally re-validates tenant/company scope via
-- src/modules/org/read/references.ts, since a bare FK only proves the id exists
-- *somewhere*, not that it belongs to the caller's company.
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_departments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_centers_tenant_company_idx" ON "cost_centers" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centers_tenant_company_code_uidx" ON "cost_centers" USING btree ("tenant_id","company_id","code");--> statement-breakpoint
CREATE INDEX "departments_tenant_company_idx" ON "departments" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE INDEX "departments_tenant_company_parent_idx" ON "departments" USING btree ("tenant_id","company_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_tenant_company_code_uidx" ON "departments" USING btree ("tenant_id","company_id","code");--> statement-breakpoint
CREATE INDEX "locations_tenant_company_idx" ON "locations" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_tenant_company_code_uidx" ON "locations" USING btree ("tenant_id","company_id","code");--> statement-breakpoint
CREATE INDEX "positions_tenant_company_idx" ON "positions" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_tenant_company_code_uidx" ON "positions" USING btree ("tenant_id","company_id","code");--> statement-breakpoint
CREATE INDEX "employee_contacts_tenant_company_employee_idx" ON "employee_contacts" USING btree ("tenant_id","company_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_government_ids_tenant_company_idx" ON "employee_government_ids" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_government_ids_employee_id_uidx" ON "employee_government_ids" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_company_idx" ON "employees" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_company_status_idx" ON "employees" USING btree ("tenant_id","company_id","status");--> statement-breakpoint
CREATE INDEX "employees_tenant_company_department_idx" ON "employees" USING btree ("tenant_id","company_id","department_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_company_name_idx" ON "employees" USING btree ("tenant_id","company_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_company_employee_no_uidx" ON "employees" USING btree ("tenant_id","company_id","employee_no");--> statement-breakpoint
CREATE UNIQUE INDEX "users_employee_id_uidx" ON "users" USING btree ("employee_id");--> statement-breakpoint

-- Grants for the unprivileged application role (see drizzle/0001_enable_rls_and_app_role.sql).
-- Every new table gets full DML — none of them are append-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE departments TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE positions TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE locations TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cost_centers TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employees TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employee_government_ids TO cayamanan_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE employee_contacts TO cayamanan_app;
--> statement-breakpoint

-- RLS: same tenant_isolation (PERMISSIVE) + company_isolation (RESTRICTIVE) shape as
-- ai_threads/ai_confirmations/ai_tool_invocations (drizzle/0005_ai_foundation.sql) —
-- fail-closed to zero rows with no tenant/company context set for the transaction.
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON departments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON departments AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE positions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON positions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON positions AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON locations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON locations AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cost_centers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cost_centers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON cost_centers AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employees
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON employees AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE employee_government_ids ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_government_ids FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employee_government_ids
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON employee_government_ids AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );
--> statement-breakpoint

ALTER TABLE employee_contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_contacts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employee_contacts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY company_isolation ON employee_contacts AS RESTRICTIVE
  USING (
    company_id = current_setting('app.company_id', true)::uuid
    OR current_setting('app.cross_company_reporting', true) = 'on'
  );

-- Rollback: DROP TABLE employee_contacts, employee_government_ids, employees, positions,
-- locations, cost_centers CASCADE; ALTER TABLE departments DROP CONSTRAINT
-- departments_parent_id_departments_id_fk; DROP TABLE departments; ALTER TABLE users DROP
-- CONSTRAINT users_employee_id_employees_id_fk, DROP COLUMN employee_id; — no other
-- existing table/policy/grant is touched by this migration. (Drop children before
-- parents: employee_government_ids/employee_contacts before employees; employees before
-- departments/positions/locations; users' FK/column before employees.)