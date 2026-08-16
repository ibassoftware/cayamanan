import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { assertAssignmentInScope } from '../service/validate-assignment';
import { employees } from '../schema';

const UNIQUE_EMPLOYEE_NO_CONSTRAINT = 'employees_tenant_company_employee_no_uidx';

function isDuplicateEmployeeNo(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === UNIQUE_EMPLOYEE_NO_CONSTRAINT,
  );
}

const inputSchema = z
  .object({
    employeeNo: z.string().min(1),
    firstName: z.string().min(1),
    middleName: z.string().optional(),
    lastName: z.string().min(1),
    suffix: z.string().optional(),
    birthDate: z.string().date().optional(),
    sex: z.string().optional(),
    civilStatus: z.string().optional(),
    emailPersonal: z.string().email().optional(),
    emailWork: z.string().email().optional(),
    mobile: z.string().optional(),
    address: z.record(z.string(), z.unknown()).optional(),
    hireDate: z.string().date(),
    photoUrl: z.string().optional(),
    departmentId: z.string().uuid().optional(),
    positionId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
  })
  .strict();

export const createEmployeeAction = defineAction({
  id: 'employee.create',
  title: 'Create employee',
  input: inputSchema,
  output: z.object({ id: z.string().uuid(), employeeNo: z.string() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  // Ordinary risk (criterion 3): Missy can create an employee record outright, no
  // confirmation card — this is master-identity data, not salary/bank/termination.
  toolExposed: true,
  toolDescription: 'Create a new employee record (identity, contact, hire date, optional department/position/location assignment).',
  async handler(input, ctx) {
    await assertAssignmentInScope(ctx.db, ctx.tenantId, ctx.companyId, {
      departmentId: input.departmentId,
      positionId: input.positionId,
      locationId: input.locationId,
    });

    const [existing] = await ctx.db
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          eq(employees.tenantId, ctx.tenantId),
          eq(employees.companyId, ctx.companyId),
          eq(employees.employeeNo, input.employeeNo),
        ),
      )
      .limit(1);
    if (existing) {
      throw new ActionError('VALIDATION_ERROR', 'This employee number is already in use.', { field: 'employeeNo' });
    }

    try {
      const [created] = await ctx.db
        .insert(employees)
        .values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          employeeNo: input.employeeNo,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName,
          suffix: input.suffix ?? null,
          birthDate: input.birthDate ?? null,
          sex: input.sex ?? null,
          civilStatus: input.civilStatus ?? null,
          emailPersonal: input.emailPersonal ?? null,
          emailWork: input.emailWork ?? null,
          mobile: input.mobile ?? null,
          address: input.address ?? null,
          hireDate: input.hireDate,
          status: 'ACTIVE',
          photoUrl: input.photoUrl ?? null,
          departmentId: input.departmentId ?? null,
          positionId: input.positionId ?? null,
          locationId: input.locationId ?? null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({ id: employees.id, employeeNo: employees.employeeNo });
      return created;
    } catch (error) {
      if (isDuplicateEmployeeNo(error)) {
        // Race with a concurrent create for the same employee_no — the pre-check above
        // closes the common case; this closes the race itself (see
        // system.updateSetting's identical pattern for the open-row unique index).
        throw new ActionError('VALIDATION_ERROR', 'This employee number is already in use.', { field: 'employeeNo' });
      }
      throw error;
    }
  },
});
