import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { employeeNo as employeeNoField, isoDate } from '@/platform/fields';
import { applyPlannedUpserts, planUpserts } from '../service/bulk-upsert';

// Conversational counterpart to the CSV import screen ("add these three people"),
// capped well below employee.importCommit's 1000-row file cap — this is meant for a
// handful of employees a user described in chat, not a bulk file.
const MAX_ITEMS = 50;

// Every optional field is `.nullable().optional()`, not just `.optional()`: OpenAI's
// structured tool-calling sends an omitted optional field as an explicit `null`, and
// ai.approveAction's null-stripping (see that action's header comment) only inspects
// this action's own top-level input keys, never recursing into `employees[]` — so a
// model-supplied `null` inside an array item would otherwise reach the field's own zod
// check unstripped. Accepting `null` here and treating it the same as "not supplied" in
// planUpserts (stripNullish) closes that gap without depending on a mechanism that
// doesn't reach this deep.
const bulkEmployeeItemSchema = z
  .object({
    employeeNo: employeeNoField(),
    firstName: z.string().min(1).nullable().optional().describe('First name (required when creating a new employee).'),
    middleName: z.string().nullable().optional(),
    lastName: z.string().min(1).nullable().optional().describe('Last name (required when creating a new employee).'),
    suffix: z.string().nullable().optional(),
    birthDate: isoDate().nullable().optional(),
    sex: z.string().nullable().optional(),
    civilStatus: z.string().nullable().optional(),
    emailPersonal: z.string().email().nullable().optional(),
    emailWork: z.string().email().nullable().optional(),
    mobile: z.string().nullable().optional(),
    hireDate: isoDate().nullable().optional().describe('Hire date (required when creating a new employee).'),
    photoUrl: z.string().nullable().optional(),
    birthPlace: z.string().nullable().optional(),
    nationality: z.string().nullable().optional(),
    religion: z.string().nullable().optional(),
    bloodType: z.string().nullable().optional(),
  })
  .strict();

export const bulkUpsertAction = defineAction({
  id: 'employee.bulkUpsert',
  title: 'Create or update several employees at once',
  input: z
    .object({
      employees: z
        .array(bulkEmployeeItemSchema)
        .min(1)
        .max(MAX_ITEMS)
        .describe(
          `Up to ${MAX_ITEMS} employees to create or update in one all-or-nothing batch. Identified by employeeNo — an employeeNo that already exists is updated, a new one is created.`,
        ),
    })
    .strict(),
  output: z.object({ created: z.number().int(), updated: z.number().int(), employeeNumbers: z.array(z.string()) }),
  read: false,
  risk: 'high',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Create or update up to 50 employees at once from a list you supply, e.g. "add these three new hires". Not for CSV files — the employee CSV import screen handles those; this is for employees described conversationally. Requires confirmation, and either writes every row or none.',
  confirmationPreview(input) {
    return { count: input.employees.length, employeeNumbers: input.employees.map((item) => item.employeeNo) };
  },
  async handler(input, ctx) {
    const candidates = input.employees.map((item, index) => ({
      rowNumber: index + 1,
      values: item as Record<string, unknown>,
    }));

    const planned = await planUpserts(ctx.db, ctx.tenantId, ctx.companyId, candidates);

    const withErrors = planned.filter((row) => row.operation === 'ERROR');
    if (withErrors.length > 0) {
      throw new ActionError(
        'VALIDATION_ERROR',
        `${withErrors.length} item(s) failed validation; nothing was written.`,
        { details: { rows: withErrors.map(({ rowNumber, employeeNo, errors }) => ({ rowNumber, employeeNo, errors })) } },
      );
    }

    const result = await applyPlannedUpserts(ctx, planned);

    ctx.audit({
      entityType: 'employee',
      entityId: null,
      before: null,
      after: { employeeNumbers: result.employeeNumbers, created: result.created, updated: result.updated },
    });

    return result;
  },
});
