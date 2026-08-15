// Drizzle tables for the `org` domain: tenants and companies.
//
// Owned long-term by the `org` module (slice 04). Slice 01 only needs these two
// tables to exist so the platform layer (RLS, tenancy scoping, seed script) has
// something real to scope against.
import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
