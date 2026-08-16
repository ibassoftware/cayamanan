import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { employeeGovernmentIds } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

// Ordinary risk, ADMIN/HR_PAYROLL only (docs/plan/04-organization-employees.md), so no
// confirmation card. It IS audited, though: this is the one row-per-employee table and it
// is updated in place with no history, so without an audit entry "who changed this
// employee's TIN before the last payroll run" is unanswerable — and slice 09 consumes
// these values for statutory filings. CLAUDE.md's audit list is a floor, not a ceiling.
//
// before/after carry the real values, not masked ones: audit_logs is tenant+company
// RLS-scoped and readable by the same ADMIN/HR roles that may read the source table, so
// this widens no authorization boundary — and a masked trail could not support correcting
// a mis-filed government form, which is the whole reason to keep it.
const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    sssNo: z.string().nullable().optional(),
    philhealthNo: z.string().nullable().optional(),
    pagibigNo: z.string().nullable().optional(),
    tin: z.string().nullable().optional(),
    hdmfMid: z.string().nullable().optional(),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const updateGovernmentIdsAction = defineAction({
  id: 'employee.updateGovernmentIds',
  title: 'Update employee government IDs',
  input: inputSchema,
  output: z.object({ employeeId: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Set an employee’s SSS/PhilHealth/Pag-IBIG/TIN numbers (admin/HR only). Identify the employee by employeeNo (e.g. "QA-0001") rather than employeeId whenever you have it — employee numbers are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    const [existing] = await ctx.db
      .select({
        id: employeeGovernmentIds.id,
        sssNo: employeeGovernmentIds.sssNo,
        philhealthNo: employeeGovernmentIds.philhealthNo,
        pagibigNo: employeeGovernmentIds.pagibigNo,
        tin: employeeGovernmentIds.tin,
        hdmfMid: employeeGovernmentIds.hdmfMid,
      })
      .from(employeeGovernmentIds)
      .where(eq(employeeGovernmentIds.employeeId, employee.id))
      .limit(1);

    if (existing) {
      const patch: Partial<typeof employeeGovernmentIds.$inferInsert> = {
        updatedAt: ctx.now,
        updatedBy: ctx.userId,
      };
      if (input.sssNo !== undefined) patch.sssNo = input.sssNo;
      if (input.philhealthNo !== undefined) patch.philhealthNo = input.philhealthNo;
      if (input.pagibigNo !== undefined) patch.pagibigNo = input.pagibigNo;
      if (input.tin !== undefined) patch.tin = input.tin;
      if (input.hdmfMid !== undefined) patch.hdmfMid = input.hdmfMid;
      await ctx.db.update(employeeGovernmentIds).set(patch).where(eq(employeeGovernmentIds.id, existing.id));
    } else {
      await ctx.db.insert(employeeGovernmentIds).values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        employeeId: employee.id,
        sssNo: input.sssNo ?? null,
        philhealthNo: input.philhealthNo ?? null,
        pagibigNo: input.pagibigNo ?? null,
        tin: input.tin ?? null,
        hdmfMid: input.hdmfMid ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      });
    }

    const fields = ['sssNo', 'philhealthNo', 'pagibigNo', 'tin', 'hdmfMid'] as const;
    // Only the fields this call actually supplied — an omitted field is untouched, so
    // recording it would misrepresent the change as wider than it was.
    const changed = fields.filter((field) => input[field] !== undefined);
    ctx.audit({
      entityType: 'employee_government_ids',
      entityId: employee.id,
      before: Object.fromEntries(changed.map((field) => [field, existing?.[field] ?? null])),
      after: Object.fromEntries(changed.map((field) => [field, input[field] ?? null])),
    });

    return { employeeId: employee.id };
  },
});
