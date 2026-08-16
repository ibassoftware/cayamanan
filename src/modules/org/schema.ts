// Drizzle tables for the `org` domain: tenants, companies, and (04-organization-employees.md)
// the org reference data departments/positions/locations/cost_centers hang from.
//
// Owned long-term by the `org` module (slice 04). Slice 01 only needed tenants/companies
// to exist so the platform layer (RLS, tenancy scoping, seed script) had something real
// to scope against; slice 04 adds the reference tables below.
import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    legalName: text('legal_name').notNull(),
    tin: text('tin'),
    rdoCode: text('rdo_code'),
    sssEmployerNo: text('sss_employer_no'),
    philhealthEmployerNo: text('philhealth_employer_no'),
    pagibigEmployerNo: text('pagibig_employer_no'),
    address: text('address'),
    timezone: text('timezone').notNull().default('Asia/Manila'),
    defaultCurrency: text('default_currency').notNull().default('PHP'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    // `companies` has no `company_id` column (it IS the company row), so the
    // leading-index convention here is just `tenant_id`.
    index('companies_tenant_id_idx').on(table.tenantId),
  ],
);

// Self-referencing tree, depth-limited (see MAX_DEPARTMENT_DEPTH in
// service/department-tree.ts — enforced in application code, not a DB constraint).
// `depth` is a denormalized cache of "how many parents up to the root", maintained by
// org.createDepartment/updateDepartment so filtering/rendering never has to walk the
// tree at read time; it is never trusted from client input.
//
// `parentId` deliberately has no `.references()` FK to itself in this Drizzle schema —
// self-referencing FKs are fine at the DB level (added as a plain `ALTER TABLE` in the
// migration instead) but Drizzle's circular type inference for a self-referencing
// `.references()` call is awkward to keep clean; the migration is the source of truth
// for the constraint either way.
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    depth: integer('depth').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('departments_tenant_company_idx').on(table.tenantId, table.companyId),
    index('departments_tenant_company_parent_idx').on(table.tenantId, table.companyId, table.parentId),
    uniqueIndex('departments_tenant_company_code_uidx').on(table.tenantId, table.companyId, table.code),
  ],
);

export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('positions_tenant_company_idx').on(table.tenantId, table.companyId),
    uniqueIndex('positions_tenant_company_code_uidx').on(table.tenantId, table.companyId, table.code),
  ],
);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    timezone: text('timezone').notNull().default('Asia/Manila'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('locations_tenant_company_idx').on(table.tenantId, table.companyId),
    uniqueIndex('locations_tenant_company_code_uidx').on(table.tenantId, table.companyId, table.code),
  ],
);

// Needed by slice 14 reporting; not assigned on `employees` in slice 04 (no acceptance
// criterion requires it at employee-creation time) — CRUD-only reference data here.
export const costCenters = pgTable(
  'cost_centers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('cost_centers_tenant_company_idx').on(table.tenantId, table.companyId),
    uniqueIndex('cost_centers_tenant_company_code_uidx').on(table.tenantId, table.companyId, table.code),
  ],
);
