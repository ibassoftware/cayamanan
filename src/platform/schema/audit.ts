// `audit_logs` — append-only, framework-written (see src/platform/actions.ts).
//
// Deliberately has no FK to `org.tenants`/`org.companies`: platform must never import
// another module's schema (see 00-overview.md §4.1), and audit rows must survive
// independently of the entities they reference forever, so no FK cascade risk either.
// tenant_id/company_id are plain columns enforced by RLS + application logic.
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorKind: text('actor_kind').notNull(), // 'USER' | 'MISSY'
    actionId: text('action_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    before: jsonb('before'),
    after: jsonb('after'),
    requestId: text('request_id').notNull(),
    confirmationToken: text('confirmation_token'),
  },
  (table) => [
    index('audit_logs_tenant_company_occurred_idx').on(
      table.tenantId,
      table.companyId,
      table.occurredAt,
    ),
    index('audit_logs_action_id_idx').on(table.actionId),
  ],
);
