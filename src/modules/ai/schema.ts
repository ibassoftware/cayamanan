// Drizzle tables for the `ai` domain — Missy foundation (03-missy-foundation.md).
//
// No FK to `org.tenants`/`org.companies` for the same reason as audit_logs/system_settings
// (platform/module boundary: a module never imports another module's schema.ts). All three
// tables carry both tenant_id and company_id and get the same RLS shape as audit_logs/
// system_settings (tenant_isolation + company_isolation RESTRICTIVE) — see
// drizzle/0003_company_isolation_rls.sql for the policy rationale, replayed for these
// tables in drizzle/0005_ai_foundation.sql.
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Mastra's own memory tables (`mastra_threads` etc., in the same Postgres database — see
// src/mastra/index.ts) are the source of truth for message content. This table is only our
// own listing index (title, last-activity ordering) scoped by tenant/company/user, per
// 03-missy-foundation.md's data model — never used to reconstruct conversation content.
export const aiThreads = pgTable(
  'ai_threads',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    userId: uuid('user_id').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_threads_tenant_company_user_idx').on(table.tenantId, table.companyId, table.userId),
    index('ai_threads_last_message_at_idx').on(table.lastMessageAt),
  ],
);

// One row per proposed high-risk action ("agent proposes -> UI renders a confirmation
// card -> user approves -> action executes", 03-missy-foundation.md). `inputPreview` is a
// redacted summary only (from the action's `confirmationPreview()`); the actual input the
// user approves against is re-submitted by the client and checked against `inputHash`
// (src/modules/ai/service/confirmations.ts) — this table is never the system of record for
// the input itself, only for the fact that a specific hash of it was proposed, to whom,
// and whether it's been consumed.
export const aiConfirmations = pgTable(
  'ai_confirmations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    userId: uuid('user_id').notNull(),
    actionId: text('action_id').notNull(),
    inputHash: text('input_hash').notNull(),
    inputPreview: jsonb('input_preview').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    index('ai_confirmations_tenant_company_user_idx').on(table.tenantId, table.companyId, table.userId),
    index('ai_confirmations_expires_at_idx').on(table.expiresAt),
  ],
);

// Metadata only — never inputs/outputs, which may carry PII or money
// (03-missy-foundation.md data model: "never inputs/outputs containing PII or money").
// `status`: 'success' | 'confirmation_required' | 'error'. `errorCode` mirrors
// `AppError.code` (src/platform/errors.ts) when status is 'error', else null.
export const aiToolInvocations = pgTable(
  'ai_tool_invocations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    userId: uuid('user_id').notNull(),
    threadId: text('thread_id').notNull(),
    actionId: text('action_id').notNull(),
    status: text('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
    errorCode: text('error_code'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_tool_invocations_tenant_company_thread_idx').on(table.tenantId, table.companyId, table.threadId),
    index('ai_tool_invocations_action_id_idx').on(table.actionId),
  ],
);

// Server-side staging for a file attached in the Missy composer (`ai.createAttachment` /
// `ai.listAttachments` / `service/attachments.ts`'s `getAttachmentContent`) — the file is
// referred to by `id` in the conversation; the model is told a filename, a byte size and
// a row count, never `content`. Employee CSV imports must stay on the deterministic
// parser (`src/modules/employee/service/csv.ts`), the same principle CLAUDE.md applies to
// payroll amounts, so this table exists precisely so the model never has to see the rows.
//
// This table holds unredacted employee PII pasted in by a user — treat every row as
// PII-class data: readable only by its own `userId`, and short-lived. `expiresAt` is a
// 1-hour TTL (`ai.createAttachment`'s handler); there is no scheduler/cron in this app, so
// expired rows are only ever reaped opportunistically, from `deleteExpiredAttachments`
// (`service/attachments.ts`), called at the top of every `ai.createAttachment` call —
// never a background job.
export const chatAttachments = pgTable(
  'chat_attachments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    // Owner of this staged file — every read (list, content resolution) is additionally
    // filtered to this column in application code, since RLS below only knows about
    // tenant_id/company_id, not per-row ownership.
    userId: uuid('user_id').notNull(),
    // Set once the attachment is actually sent as part of a message, for a possible future
    // "attachments in this thread" view — nullable because a file can be staged (picked in
    // the composer) before any thread exists yet. Not queried by anything in this slice.
    threadId: uuid('thread_id'),
    // Display label only, sanitized at upload time (service/attachments.ts) — never used
    // as a filesystem path.
    filename: text('filename').notNull(),
    // Derived from the filename's extension at upload time (service/attachments.ts) —
    // never a client-declared value; only .csv/.tsv/.txt are ever accepted.
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    // CSV/TSV/plain text only, so a plain `text` column is enough — no need for the
    // `bytea` this domain would need for arbitrary binary content (contrast
    // employee_documents.content in src/modules/employee/schema.ts).
    content: text('content').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('chat_attachments_tenant_company_user_idx').on(table.tenantId, table.companyId, table.userId),
    // Backs the opportunistic `deleteExpiredAttachments` sweep — every row past its TTL,
    // regardless of owner, in a single scan rather than a full table scan.
    index('chat_attachments_expires_at_idx').on(table.expiresAt),
  ],
);
