// Drizzle tables for the `employee` domain — 04-organization-employees.md.
//
// `employees` is master identity only — no pay data (that lands in slice 05's
// `employments`/`payment_details`). `department_id`/`position_id`/`location_id` are a
// deliberate, documented exception to "master data has no effective-dating": see the
// long comment on those three columns below for why they exist here at all and what
// slice 05 must do with them.
//
// `department_id`/`position_id`/`location_id` reference `org.departments`/`positions`/
// `locations` at the database level (plain `ALTER TABLE ... FOREIGN KEY` in the
// migration), but deliberately do NOT use Drizzle's `.references()` here — that would
// require importing `@/modules/org/schema` into this file, crossing the "a module never
// imports another module's schema.ts" boundary (00-overview.md §4.1). Tenant/company
// scoping of those references is re-validated in application code via
// `@/modules/org/read/references.ts` (an allowed `read/` export), not by the FK alone —
// a real Postgres FK only proves the id exists *somewhere*, never that it belongs to the
// caller's company.
import { sql } from 'drizzle-orm';
import { date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    employeeNo: text('employee_no').notNull(),
    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    lastName: text('last_name').notNull(),
    suffix: text('suffix'),
    birthDate: date('birth_date'),
    sex: text('sex'),
    civilStatus: text('civil_status'),
    emailPersonal: text('email_personal'),
    emailWork: text('email_work'),
    mobile: text('mobile'),
    address: jsonb('address'),
    hireDate: date('hire_date').notNull(),
    // 'ACTIVE' | 'ON_LEAVE' | 'SEPARATED' — plain text, matching the rest of the
    // codebase's convention (see users.status). `employee.setStatus` (slice 04) only
    // permits ACTIVE <-> ON_LEAVE; SEPARATED is reserved for slice 05's termination flow
    // (separation date/reason live on `employments`, not here).
    status: text('status').notNull().default('ACTIVE'),
    photoUrl: text('photo_url'),
    // Current-assignment convenience fields, NOT effective-dated — see schema.ts header
    // comment and docs/plan/04-organization-employees.md for the slice-05 migration plan.
    departmentId: uuid('department_id'),
    positionId: uuid('position_id'),
    locationId: uuid('location_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employees_tenant_company_idx').on(table.tenantId, table.companyId),
    index('employees_tenant_company_status_idx').on(table.tenantId, table.companyId, table.status),
    index('employees_tenant_company_department_idx').on(table.tenantId, table.companyId, table.departmentId),
    index('employees_tenant_company_name_idx').on(table.tenantId, table.companyId, table.lastName, table.firstName),
    uniqueIndex('employees_tenant_company_employee_no_uidx').on(table.tenantId, table.companyId, table.employeeNo),
  ],
);

// Separated from `employees` so it can be permission-gated and excluded from generic
// reads (employee.list never joins this table at all — see actions/list-employees.ts).
// One row per employee (enforced by the unique index on employeeId).
export const employeeGovernmentIds = pgTable(
  'employee_government_ids',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    sssNo: text('sss_no'),
    philhealthNo: text('philhealth_no'),
    pagibigNo: text('pagibig_no'),
    tin: text('tin'),
    hdmfMid: text('hdmf_mid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employee_government_ids_tenant_company_idx').on(table.tenantId, table.companyId),
    uniqueIndex('employee_government_ids_employee_id_uidx').on(table.employeeId),
  ],
);

export const employeeContacts = pgTable(
  'employee_contacts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    // 'EMERGENCY' | 'BENEFICIARY'
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    relationship: text('relationship'),
    mobile: text('mobile'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employee_contacts_tenant_company_employee_idx').on(table.tenantId, table.companyId, table.employeeId),
  ],
);
