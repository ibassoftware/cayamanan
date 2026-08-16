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
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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
    // Present address. Paired with `permanentAddress` below (the PH 201-file convention
    // of tracking both) — deliberately not renamed to `presentAddress` since it predates
    // this pairing and every existing caller (create-employee.ts, update-employee.ts,
    // load-employee-detail.ts) already reads/writes it as `address`.
    address: jsonb('address'),
    // Permanent address — nullable because most PH ids/forms treat "same as present" as
    // the default and only record this when it differs. No 1:1 constraint tying the two
    // together; the pairing is convention, not a DB rule.
    permanentAddress: jsonb('permanent_address'),
    birthPlace: text('birth_place'),
    nationality: text('nationality'),
    religion: text('religion'),
    bloodType: text('blood_type'),
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
    // The enrollment id a physical biometric/time-clock device assigns to this person —
    // device-facing operational data, deliberately NOT in employee_government_ids (it is
    // not a government-issued identifier). Nullable: most employees have none until
    // enrolled on a device. Slice 07's Attendance CSV import uses this as the join key to
    // match raw device rows back to an employee — see the partial unique index below,
    // which exists so two employees can never share one (that would silently mis-attribute
    // attendance, which becomes wrong pay downstream).
    biometricId: text('biometric_id'),
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
    // Partial: the many NULLs (not yet enrolled on a device) must never collide, only
    // actual assigned ids need to be unique per company.
    uniqueIndex('employees_tenant_company_biometric_id_uidx')
      .on(table.tenantId, table.companyId, table.biometricId)
      .where(sql`${table.biometricId} IS NOT NULL`),
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
    // 'EMERGENCY' | 'BENEFICIARY' | 'DEPENDENT' — plain text, matching the rest of the
    // codebase's convention (see employees.status above). DEPENDENT reuses this table
    // rather than a separate `employee_dependents` table: the shape (name/relationship/
    // contact details) is close enough that a fourth table would be pure duplication for
    // no behavioural gain (201-file task packet decision).
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    relationship: text('relationship'),
    mobile: text('mobile'),
    email: text('email'),
    address: text('address'),
    // A DEPENDENT's age determines tax qualification (BIR dependent exemption rules) —
    // irrelevant for EMERGENCY/BENEFICIARY rows, left null there.
    birthDate: date('birth_date'),
    // True for the primary EMERGENCY contact / primary BENEFICIARY — at most a UI/reporting
    // convenience flag, not enforced unique per employee+kind at the DB level (an employee
    // legitimately having zero or, transiently while editing, more than one is not an
    // integrity violation worth a constraint over).
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employee_contacts_tenant_company_employee_idx').on(table.tenantId, table.companyId, table.employeeId),
  ],
);

// The 201-file child tables below (education, work history, training, requirements) all
// follow the exact same shape as employee_contacts above: tenant/company + employeeId FK,
// created/updated audit columns, one leading index on (tenant_id, company_id, employee_id),
// RLS enabled + FORCEd with the identical tenant_isolation/company_isolation policy pair
// (see drizzle/0006_organization_employee_master_data.sql, copied verbatim in this
// domain's next migration). No file attachment in this slice (employee_requirements is an
// onboarding checklist only) and no dependents table — DEPENDENT is a `kind` on
// employee_contacts above, not a fifth table.

export const employeeEducation = pgTable(
  'employee_education',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    // 'ELEMENTARY' | 'SECONDARY' | 'SENIOR_HIGH' | 'VOCATIONAL' | 'COLLEGE' | 'GRADUATE'
    level: text('level').notNull(),
    school: text('school').notNull(),
    degree: text('degree'),
    fieldOfStudy: text('field_of_study'),
    startYear: integer('start_year'),
    endYear: integer('end_year'),
    honors: text('honors'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employee_education_tenant_company_employee_idx').on(table.tenantId, table.companyId, table.employeeId),
  ],
);

export const employeeWorkHistory = pgTable(
  'employee_work_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    employer: text('employer').notNull(),
    position: text('position'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    reasonForLeaving: text('reason_for_leaving'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employee_work_history_tenant_company_employee_idx').on(table.tenantId, table.companyId, table.employeeId),
  ],
);

export const employeeTraining = pgTable(
  'employee_training',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    title: text('title').notNull(),
    provider: text('provider'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    // Not money — training duration in hours. Kept `numeric` (a string end to end, per
    // CLAUDE.md's "pg returns numeric as a string, never parseFloat it") purely so a
    // fractional value (e.g. "7.5") round-trips exactly; `Money` is not involved because
    // this never enters a payroll calculation.
    hours: numeric('hours', { precision: 8, scale: 2 }),
    certificateNo: text('certificate_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employee_training_tenant_company_employee_idx').on(table.tenantId, table.companyId, table.employeeId),
  ],
);

export const employeeRequirements = pgTable(
  'employee_requirements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    // Free-text checklist item name (e.g. "SSS E-1 form", "NBI clearance") — no fixed
    // catalog in this slice, so no separate lookup table.
    requirement: text('requirement').notNull(),
    // 'PENDING' | 'SUBMITTED' | 'WAIVED'
    status: text('status').notNull().default('PENDING'),
    submittedOn: date('submitted_on'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employee_requirements_tenant_company_employee_idx').on(table.tenantId, table.companyId, table.employeeId),
    // Backs `employee.setRequirement`'s upsert-by-(employeeId, requirement) semantics —
    // without this, a race between two concurrent setRequirement calls for the same
    // checklist item could insert two rows (the same class of bug create-employee.ts's
    // isDuplicateEmployeeNo comment already documents for employee_no).
    uniqueIndex('employee_requirements_tenant_company_employee_requirement_uidx').on(
      table.tenantId,
      table.companyId,
      table.employeeId,
      table.requirement,
    ),
  ],
);

// Raw binary content, stored in Postgres itself — not the filesystem, not an external
// object store (201-file task packet decision, not relitigated here). Rationale: it
// inherits the existing FORCEd RLS tenant/company isolation automatically (the same
// `tenant_isolation`/`company_isolation` policy pair as every other employee_* table
// below), it is transactional with the row it belongs to (an upload and its employee
// context either both commit or neither does), and it behaves identically across
// restarts and multiple app instances with zero extra infrastructure. The query surface
// stays narrow and lives only in this table + the employee.*Document actions +
// service/resolve-document-for-download.ts, so swapping the backing store later (if this
// ever needs to move to object storage for size/cost reasons) is a contained change —
// but there is deliberately no pluggable storage abstraction here, because there is
// exactly one implementation.
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const employeeDocuments = pgTable(
  'employee_documents',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    // 'PHOTO' | 'REQUIREMENT' | 'GENERAL' — the CHECK constraint below enforces each
    // kind's shape at the DB level, not just in the upload action: PHOTO has neither
    // requirementId nor documentType; REQUIREMENT always references the checklist item it
    // evidences (and has no documentType — a REQUIREMENT is typed by the requirement it
    // links, not by this column); GENERAL always carries a documentType and never a
    // requirementId.
    kind: text('kind').notNull(),
    requirementId: uuid('requirement_id').references(() => employeeRequirements.id),
    // Set only when kind = 'GENERAL' — a plain text union (not a DB enum, matching
    // kind/status elsewhere in this file): 'CONTRACT' | 'RESUME' | 'GOVERNMENT_ID' |
    // 'MEDICAL' | 'CERTIFICATE' | 'CLEARANCE' | 'OTHER'. Null for PHOTO/REQUIREMENT — see
    // the CHECK constraint for the DB-level guarantee.
    documentType: text('document_type'),
    // Display label only, sanitized at upload time (service/document-validation.ts) —
    // never used as a filesystem path, so path separators/control characters are
    // stripped before this is stored.
    filename: text('filename').notNull(),
    // The *sniffed* MIME type (magic bytes), never the client-declared one — see
    // service/document-validation.ts. Always one of the four allowlisted types; SVG is
    // never accepted at any layer (script-execution vector).
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    // sha256 hex digest of `content`, computed at upload time — integrity check, never
    // used for deduplication in this slice.
    checksum: text('checksum').notNull(),
    content: bytea('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('employee_documents_tenant_company_employee_idx').on(table.tenantId, table.companyId, table.employeeId),
    // At most one PHOTO per employee — enforced here, not just in the upload action's
    // pre-check (the same race the requirements/employee_no unique indexes above already
    // guard against).
    uniqueIndex('employee_documents_one_photo_per_employee_uidx')
      .on(table.tenantId, table.companyId, table.employeeId)
      .where(sql`${table.kind} = 'PHOTO'`),
    // Each kind's requirementId/documentType shape is a DB-level guarantee, not just
    // application-code discipline, so a bug in the upload action can't silently produce a
    // PHOTO/REQUIREMENT row wired to a documentType, a PHOTO/GENERAL row wired to a
    // requirement, or a REQUIREMENT/GENERAL row missing what it needs.
    check(
      'employee_documents_kind_shape_check',
      sql`(${table.kind} = 'PHOTO' AND ${table.requirementId} IS NULL AND ${table.documentType} IS NULL)
        OR (${table.kind} = 'REQUIREMENT' AND ${table.requirementId} IS NOT NULL AND ${table.documentType} IS NULL)
        OR (${table.kind} = 'GENERAL' AND ${table.requirementId} IS NULL AND ${table.documentType} IS NOT NULL)`,
    ),
  ],
);

// Reusable onboarding checklists — "a template that would trigger the same set of
// onboarding files": define a checklist once (`items`), then `employee.applyOnboarding
// Template` creates one `employee_requirements` row per item for a given employee.
//
// House pattern, same as departments/positions/locations (org/schema.ts): tenant/company
// scoped, RLS enabled + FORCEd with the identical tenant_isolation/company_isolation
// policy pair.
//
// `items` is jsonb, not a child table: each item is an inert `{ requirement, notes? }`
// label that is only ever read as a whole ordered list alongside its template — never
// queried, filtered, or joined on its own. A child table (`onboarding_template_items`)
// would add a full extra schema/action/RLS surface for zero query benefit; jsonb keeps
// the list's order for free (a child table would need an explicit `position` column to
// get the same thing) and is rewritten wholesale on every `onboarding.updateTemplate`
// call anyway, which is exactly what jsonb is good at and a child table is not.
export const onboardingTemplates = pgTable(
  'onboarding_templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    companyId: uuid('company_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    // At most one default template per company (partial unique index below) — the
    // template `employee.applyOnboardingTemplate`/a future "apply the default on hire"
    // flow falls back to when none is named explicitly. Not enforced/consumed by this
    // slice's actions beyond storing and listing it; applying still always requires an
    // explicit templateId.
    isDefault: boolean('is_default').notNull().default(false),
    // Ordered array of `{ requirement: string, notes?: string }` — see the table comment
    // above for why this is jsonb and not a child table. Never queried/filtered on its
    // contents; always read and rewritten as one whole array.
    items: jsonb('items').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('onboarding_templates_tenant_company_idx').on(table.tenantId, table.companyId),
    uniqueIndex('onboarding_templates_tenant_company_name_uidx').on(table.tenantId, table.companyId, table.name),
    // At most one is_default = true per company — a partial unique index (not a CHECK,
    // which cannot express "at most one row"), same technique as
    // employee_documents_one_photo_per_employee_uidx above.
    uniqueIndex('onboarding_templates_one_default_per_company_uidx')
      .on(table.tenantId, table.companyId)
      .where(sql`${table.isDefault} = true`),
  ],
);
