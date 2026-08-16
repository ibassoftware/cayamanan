import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { biometricId as biometricIdField, isoDate, uuidRef } from '@/platform/fields';
import { assertAssignmentInScope } from '../service/validate-assignment';
import { employees } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const UNIQUE_BIOMETRIC_ID_CONSTRAINT = 'employees_tenant_company_biometric_id_uidx';

function isDuplicateBiometricId(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === UNIQUE_BIOMETRIC_ID_CONSTRAINT,
  );
}

// `employeeNo` is immutable after creation (not editable here — see
// employee-selector.ts's header comment for why that means `employeeId`/`employeeNo`
// need no "also a mutable field" special-casing) and `status` has its own action
// (employee.setStatus) — kept separate so status transitions stay a single, reviewable
// code path rather than folded into a generic profile PATCH.
const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    firstName: z.string().min(1).optional(),
    middleName: z.string().nullable().optional(),
    lastName: z.string().min(1).optional(),
    suffix: z.string().nullable().optional(),
    birthDate: isoDate().nullable().optional(),
    sex: z.string().nullable().optional(),
    civilStatus: z.string().nullable().optional(),
    emailPersonal: z.string().email().nullable().optional(),
    emailWork: z.string().email().nullable().optional(),
    mobile: z.string().nullable().optional(),
    address: z.record(z.string(), z.unknown()).nullable().optional(),
    permanentAddress: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe('Permanent address, if different from the present address.'),
    birthPlace: z.string().nullable().optional().describe('Place of birth.'),
    nationality: z.string().nullable().optional().describe('Nationality/citizenship.'),
    religion: z.string().nullable().optional().describe('Religion, for statutory/HR forms.'),
    bloodType: z.string().nullable().optional().describe('Blood type (e.g. "O+").'),
    hireDate: isoDate().optional(),
    photoUrl: z.string().nullable().optional(),
    departmentId: uuidRef('department').nullable().optional(),
    positionId: uuidRef('position').nullable().optional(),
    locationId: uuidRef('location').nullable().optional(),
    biometricId: biometricIdField().nullable().optional(),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const updateEmployeeAction = defineAction({
  id: 'employee.update',
  title: 'Update employee',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Update an employee’s profile fields or current department/position/location assignment. Identify the employee by employeeNo (e.g. "QA-0001") rather than employeeId whenever you have it — employee numbers are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const existing = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    if (input.departmentId !== undefined || input.positionId !== undefined || input.locationId !== undefined) {
      await assertAssignmentInScope(ctx.db, ctx.tenantId, ctx.companyId, {
        departmentId: input.departmentId,
        positionId: input.positionId,
        locationId: input.locationId,
      });
    }

    const patch: Partial<typeof employees.$inferInsert> = { updatedAt: ctx.now, updatedBy: ctx.userId };
    if (input.firstName !== undefined) patch.firstName = input.firstName;
    if (input.middleName !== undefined) patch.middleName = input.middleName;
    if (input.lastName !== undefined) patch.lastName = input.lastName;
    if (input.suffix !== undefined) patch.suffix = input.suffix;
    if (input.birthDate !== undefined) patch.birthDate = input.birthDate;
    if (input.sex !== undefined) patch.sex = input.sex;
    if (input.civilStatus !== undefined) patch.civilStatus = input.civilStatus;
    if (input.emailPersonal !== undefined) patch.emailPersonal = input.emailPersonal;
    if (input.emailWork !== undefined) patch.emailWork = input.emailWork;
    if (input.mobile !== undefined) patch.mobile = input.mobile;
    if (input.address !== undefined) patch.address = input.address;
    if (input.permanentAddress !== undefined) patch.permanentAddress = input.permanentAddress;
    if (input.birthPlace !== undefined) patch.birthPlace = input.birthPlace;
    if (input.nationality !== undefined) patch.nationality = input.nationality;
    if (input.religion !== undefined) patch.religion = input.religion;
    if (input.bloodType !== undefined) patch.bloodType = input.bloodType;
    if (input.hireDate !== undefined) patch.hireDate = input.hireDate;
    if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;
    if (input.departmentId !== undefined) patch.departmentId = input.departmentId;
    if (input.positionId !== undefined) patch.positionId = input.positionId;
    if (input.locationId !== undefined) patch.locationId = input.locationId;
    if (input.biometricId !== undefined) patch.biometricId = input.biometricId;

    try {
      await ctx.db.update(employees).set(patch).where(eq(employees.id, existing.id));
    } catch (error) {
      if (isDuplicateBiometricId(error)) {
        throw new ActionError('VALIDATION_ERROR', 'This biometric id is already assigned to another employee.', {
          field: 'biometricId',
        });
      }
      throw error;
    }

    return { id: existing.id };
  },
});
