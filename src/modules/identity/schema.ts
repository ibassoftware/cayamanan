// Drizzle tables for the `identity` domain — 02-identity-auth.md.
//
// `users.employee_id` (04-organization-employees.md, "lands in slice 04") links a
// self-service account to its employee record. It deliberately has no `.references()`
// here (would require importing `@/modules/employee/schema`, crossing the module
// boundary — see 00-overview.md §4.1); the real FK is a plain `ALTER TABLE` in the
// migration. Written only via `service/employee-link.ts`'s `setUserEmployeeId`, called
// by `employee.linkUserAccount` (owned by the `employee` module, which imports this
// file's `service/` export — allowed — not this schema.ts — not allowed).
//
// `users`/`user_roles`/`sessions` carry `tenant_id` but deliberately NOT `company_id`
// as an RLS predicate (unlike the L1 "every table carries tenant_id + company_id"
// convention default): `sessions` doesn't even have a `company_id` column (by design —
// see the plan doc and drizzle/0004_identity_auth.sql), and adding a company-scoped RLS
// policy to `users` would make it impossible to look up "the user for this session"
// before we know their company — exactly the chicken-and-egg problem
// `withTenantOnlyContext` (src/platform/db.ts) exists to solve. `users.company_id` is
// still a real, required column; handlers that list/filter users must add an explicit
// `WHERE company_id = ctx.companyId` predicate themselves (the same discipline
// `audit_logs`/`system_settings` needed before the company_isolation RLS policy existed
// — see drizzle/0003_company_isolation_rls.sql).
//
// `login_attempts` carries neither `tenant_id` nor `company_id` at all: it exists to
// rate-limit and record login attempts *before* any tenant is known (an unknown email is
// a valid, expected input), so it cannot be tenant-scoped by construction. It holds only
// a hash of the attempted email/IP, a timestamp and a success flag — no tenant-scoped or
// otherwise sensitive data — so it does not get RLS.
import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    // 'ACTIVE' | 'INACTIVE' — plain text, not a DB enum, matching the rest of the
    // codebase's convention (see companies.status/tenants.status).
    status: text('status').notNull().default('ACTIVE'),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    // Nullable: most users (ADMIN/HR-only accounts) never get one; set exactly once by
    // employee.linkUserAccount. See header comment above for why there's no `.references()`.
    employeeId: uuid('employee_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('users_tenant_company_idx').on(table.tenantId, table.companyId),
    // Email is unique per tenant (a natural key the login lookup can trust to be at
    // most one row per tenant); the app always normalizes to lowercase before writing
    // or querying, so a plain unique index is enough (no functional lower() index).
    uniqueIndex('users_tenant_email_uidx').on(table.tenantId, table.email),
    // One user per employee (Postgres treats multiple NULLs as distinct, so unlinked
    // users are unaffected). Enforces the one-to-one self-service link at the DB layer,
    // not just in employee.linkUserAccount's own pre-check.
    uniqueIndex('users_employee_id_uidx').on(table.employeeId),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // 'ADMIN' | 'HR_PAYROLL' | 'EMPLOYEE' (src/platform/actions.ts `Role`).
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (table) => [
    index('user_roles_tenant_user_idx').on(table.tenantId, table.userId),
    uniqueIndex('user_roles_user_role_uidx').on(table.userId, table.role),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
  },
  (table) => [
    index('sessions_tenant_user_idx').on(table.tenantId, table.userId),
    // Every request resolves the cookie's session id via this index, then checks
    // revoked_at/expires_at in application code (src/modules/identity/service/session.ts).
    index('sessions_tenant_id_idx').on(table.tenantId, table.id),
  ],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    emailHash: text('email_hash').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    success: boolean('success').notNull(),
    ipHash: text('ip_hash'),
  },
  (table) => [index('login_attempts_email_hash_at_idx').on(table.emailHash, table.at)],
);
