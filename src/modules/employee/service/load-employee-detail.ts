// Shared by employee.get (ADMIN/HR_PAYROLL) and employee.getSelf (scope:'self') — both
// are already gated to callers the PII boundary allows to see government IDs/contacts
// ("returned only to ADMIN/HR or to the employee themself"), so both may safely embed
// the full detail in one payload. employee.list (a different, broader-reach action) never
// calls this — see list-employees.ts.
import { and, eq } from 'drizzle-orm';

import type { ScopedDb } from '@/platform/db';
import { employeeContacts, employeeGovernmentIds, employees } from '../schema';

export interface EmployeeDetail {
  id: string;
  employeeNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  birthDate: string | null;
  sex: string | null;
  civilStatus: string | null;
  emailPersonal: string | null;
  emailWork: string | null;
  mobile: string | null;
  address: unknown;
  hireDate: string;
  status: string;
  photoUrl: string | null;
  departmentId: string | null;
  positionId: string | null;
  locationId: string | null;
  governmentIds: {
    sssNo: string | null;
    philhealthNo: string | null;
    pagibigNo: string | null;
    tin: string | null;
    hdmfMid: string | null;
  } | null;
  contacts: {
    id: string;
    kind: string;
    name: string;
    relationship: string | null;
    mobile: string | null;
  }[];
}

export async function loadEmployeeDetail(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  employeeId: string,
): Promise<EmployeeDetail | null> {
  const [employee] = await tenantDb
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId), eq(employees.companyId, companyId)))
    .limit(1);
  if (!employee) {
    return null;
  }

  // Sequential, not Promise.all: `tenantDb` is a single connection bound to the caller's
  // transaction — see the identical note in validate-assignment.ts.
  const govIdsRows = await tenantDb
    .select()
    .from(employeeGovernmentIds)
    .where(eq(employeeGovernmentIds.employeeId, employeeId))
    .limit(1);
  const contactRows = await tenantDb.select().from(employeeContacts).where(eq(employeeContacts.employeeId, employeeId));
  const govIds = govIdsRows[0] ?? null;

  return {
    id: employee.id,
    employeeNo: employee.employeeNo,
    firstName: employee.firstName,
    middleName: employee.middleName,
    lastName: employee.lastName,
    suffix: employee.suffix,
    birthDate: employee.birthDate,
    sex: employee.sex,
    civilStatus: employee.civilStatus,
    emailPersonal: employee.emailPersonal,
    emailWork: employee.emailWork,
    mobile: employee.mobile,
    address: employee.address,
    hireDate: employee.hireDate,
    status: employee.status,
    photoUrl: employee.photoUrl,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    locationId: employee.locationId,
    governmentIds: govIds
      ? {
          sssNo: govIds.sssNo,
          philhealthNo: govIds.philhealthNo,
          pagibigNo: govIds.pagibigNo,
          tin: govIds.tin,
          hdmfMid: govIds.hdmfMid,
        }
      : null,
    contacts: contactRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      relationship: row.relationship,
      mobile: row.mobile,
    })),
  };
}
