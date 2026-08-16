import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { uuidRef } from '@/platform/fields';
import { employees } from '../schema';
import { buildSearchPatterns } from '../service/employee-search';

// Deliberately excludes birth_date/sex/civil_status/email*/mobile/address and never
// touches employee_government_ids/employee_contacts at all — the PII boundary
// (04-organization-employees.md: "omitted from employee.list payloads entirely, not
// merely hidden by the UI"). Criterion 4: Missy answering "show me all active employees
// in Finance" via this action must never see a TIN/SSS number — true here because the
// query itself never selects or joins that table, not because a field was stripped after
// the fact.
const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  employeeNo: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  suffix: z.string().nullable(),
  status: z.string(),
  hireDate: z.string(),
  photoUrl: z.string().nullable(),
  departmentId: z.string().uuid().nullable(),
  positionId: z.string().uuid().nullable(),
  locationId: z.string().uuid().nullable(),
});

const MAX_PAGE_SIZE = 100;

export const listEmployeesAction = defineAction({
  id: 'employee.list',
  title: 'List employees',
  input: z
    .object({
      search: z
        .string()
        .optional()
        .describe(
          'Free text matched against employee number and every part of the name. Words may be given in any order — "Maria Santos" and "Santos Maria" both find Maria Clara Santos.',
        ),
      // Missy was calling this action three times in a row, once per status, because
      // nothing told her what omitting it does.
      status: z
        .enum(['ACTIVE', 'ON_LEAVE', 'SEPARATED'])
        .optional()
        .describe('Omit to search every status. Only pass this when the user asked to filter by one.'),
      departmentId: uuidRef('department').optional(),
      positionId: uuidRef('position').optional(),
      locationId: uuidRef('location').optional(),
      limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
      offset: z.number().int().min(0).optional(),
    })
    .strict(),
  output: z.object({ employees: z.array(employeeSummarySchema), total: z.number().int() }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Search/list employees (name, employee number, department, position, location, status filters). Never returns government IDs or contact details.',
  async handler(input, ctx) {
    const limit = input.limit ?? 25;
    const offset = input.offset ?? 0;

    const conditions = [eq(employees.tenantId, ctx.tenantId), eq(employees.companyId, ctx.companyId)];
    if (input.status) conditions.push(eq(employees.status, input.status));
    if (input.departmentId) conditions.push(eq(employees.departmentId, input.departmentId));
    if (input.positionId) conditions.push(eq(employees.positionId, input.positionId));
    if (input.locationId) conditions.push(eq(employees.locationId, input.locationId));
    // Every token must match *some* searchable column, so "Maria Clara", "Maria Santos"
    // and "Santos Maria" all find Maria Clara Santos. Matching the query as one string
    // against one column at a time — the previous behaviour — meant any multi-word name
    // returned nothing at all, and middle name was never searched.
    for (const pattern of buildSearchPatterns(input.search ?? '')) {
      conditions.push(
        or(
          ilike(employees.firstName, pattern),
          ilike(employees.middleName, pattern),
          ilike(employees.lastName, pattern),
          ilike(employees.suffix, pattern),
          ilike(employees.employeeNo, pattern),
        )!,
      );
    }

    const whereClause = and(...conditions);

    // Sequential, not Promise.all: `ctx.db` is a single connection bound to this action's
    // transaction (see withTenantContext) — issuing overlapping queries on the same
    // client is unsafe (node-postgres warns and effectively serializes them anyway).
    const rows = await ctx.db
      .select({
        id: employees.id,
        employeeNo: employees.employeeNo,
        firstName: employees.firstName,
        middleName: employees.middleName,
        lastName: employees.lastName,
        suffix: employees.suffix,
        status: employees.status,
        hireDate: employees.hireDate,
        photoUrl: employees.photoUrl,
        departmentId: employees.departmentId,
        positionId: employees.positionId,
        locationId: employees.locationId,
      })
      .from(employees)
      .where(whereClause)
      .orderBy(asc(employees.lastName), asc(employees.firstName))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(employees).where(whereClause);

    return { employees: rows, total: count };
  },
});
