// `system_settings` — generic effective-dated settings store (rounding policy etc.
// in later slices). See src/platform/effective.ts for the resolution helper this
// table is read through, and the exclusion-constraint pattern documented there.
//
// No FK to `org.tenants`/`org.companies` for the same reason as audit_logs: platform
// must not import another module's schema.
import { sql } from 'drizzle-orm';
import { date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const systemSettings = pgTable(
  'system_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('system_settings_tenant_company_key_idx').on(
      table.tenantId,
      table.companyId,
      table.key,
    ),
    // At most one open (effective_to IS NULL) row per natural key — enforced here, not
    // just documented in src/platform/effective.ts. update-setting.ts still closes the
    // old row before inserting the new one; this index is what makes a concurrent
    // double-open a hard DB error instead of a silently-corrupt read later.
    uniqueIndex('system_settings_open_row_uidx')
      .on(table.tenantId, table.companyId, table.key)
      .where(sql`${table.effectiveTo} is null`),
  ],
);
