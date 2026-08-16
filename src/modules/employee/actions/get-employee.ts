import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { loadEmployeeDetail } from '../service/load-employee-detail';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

// ADMIN/HR_PAYROLL only — the PII boundary's "returned only to ADMIN/HR or the employee
// themself" is satisfied by this role list alone (criterion 6: an EMPLOYEE-only caller,
// including via Missy, gets FORBIDDEN from executeAction's own role check before this
// handler ever runs — no separate check needed here).
const governmentIdsSchema = z
  .object({
    sssNo: z.string().nullable(),
    philhealthNo: z.string().nullable(),
    pagibigNo: z.string().nullable(),
    tin: z.string().nullable(),
    hdmfMid: z.string().nullable(),
  })
  .nullable();

const contactSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  name: z.string(),
  relationship: z.string().nullable(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  birthDate: z.string().nullable(),
  isPrimary: z.boolean(),
});

const educationSchema = z.object({
  id: z.string().uuid(),
  level: z.string(),
  school: z.string(),
  degree: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  startYear: z.number().int().nullable(),
  endYear: z.number().int().nullable(),
  honors: z.string().nullable(),
});

const workHistorySchema = z.object({
  id: z.string().uuid(),
  employer: z.string(),
  position: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  reasonForLeaving: z.string().nullable(),
});

const trainingSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  provider: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  // `numeric(8,2)` comes back from `pg` as a string — never parseFloat'd (CLAUDE.md).
  hours: z.string().nullable(),
  certificateNo: z.string().nullable(),
});

const requirementSchema = z.object({
  id: z.string().uuid(),
  requirement: z.string(),
  status: z.string(),
  submittedOn: z.string().nullable(),
  notes: z.string().nullable(),
});

// Metadata only — never `content`/`checksum` (see employee.listDocuments/`GET
// /api/files/[documentId]` for where the actual bytes are read, both separately gated).
const documentSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  requirementId: z.string().uuid().nullable(),
  documentType: z.string().nullable(),
  filename: z.string(),
  mimeType: z.string(),
  byteSize: z.number(),
  createdAt: z.string(),
});

export const employeeDetailSchema = z.object({
  id: z.string().uuid(),
  employeeNo: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  suffix: z.string().nullable(),
  birthDate: z.string().nullable(),
  sex: z.string().nullable(),
  civilStatus: z.string().nullable(),
  emailPersonal: z.string().nullable(),
  emailWork: z.string().nullable(),
  mobile: z.string().nullable(),
  address: z.unknown(),
  permanentAddress: z.unknown(),
  birthPlace: z.string().nullable(),
  nationality: z.string().nullable(),
  religion: z.string().nullable(),
  bloodType: z.string().nullable(),
  hireDate: z.string(),
  status: z.string(),
  photoUrl: z.string().nullable(),
  departmentId: z.string().uuid().nullable(),
  positionId: z.string().uuid().nullable(),
  locationId: z.string().uuid().nullable(),
  // Device-facing operational data (not a government id) — see employees.biometricId's
  // column comment. Included here (ADMIN/HR_PAYROLL/self only, same PII boundary as the
  // rest of this payload); deliberately never on employee.list's output.
  biometricId: z.string().nullable(),
  governmentIds: governmentIdsSchema,
  contacts: z.array(contactSchema),
  education: z.array(educationSchema),
  workHistory: z.array(workHistorySchema),
  training: z.array(trainingSchema),
  requirements: z.array(requirementSchema),
  documents: z.array(documentSchema),
});

export const getEmployeeAction = defineAction({
  id: 'employee.get',
  title: 'Get employee',
  input: z.object({ ...employeeIdOrNoShape }).strict().superRefine(requireEmployeeIdOrNo),
  output: employeeDetailSchema,
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Get one employee’s full profile, government IDs and contacts (admin/HR only). Identify the employee by employeeNo (e.g. "QA-0001") rather than employeeId whenever you have it — employee numbers are short and transcribe reliably, ids are long random UUIDs that are easy to mistype.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);
    const detail = await loadEmployeeDetail(ctx.db, ctx.tenantId, ctx.companyId, employee.id);
    if (!detail) {
      throw new ActionError('NOT_FOUND', 'Employee not found.');
    }
    return detail;
  },
});
