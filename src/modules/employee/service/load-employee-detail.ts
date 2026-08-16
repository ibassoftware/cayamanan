// Shared by employee.get (ADMIN/HR_PAYROLL) and employee.getSelf (scope:'self') — both
// are already gated to callers the PII boundary allows to see government IDs/contacts
// ("returned only to ADMIN/HR or to the employee themself"), so both may safely embed
// the full detail in one payload. employee.list (a different, broader-reach action) never
// calls this — see list-employees.ts.
import { and, eq } from 'drizzle-orm';

import type { ScopedDb } from '@/platform/db';
import {
  employeeContacts,
  employeeDocuments,
  employeeEducation,
  employeeGovernmentIds,
  employeeRequirements,
  employeeTraining,
  employeeWorkHistory,
  employees,
} from '../schema';

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
  permanentAddress: unknown;
  birthPlace: string | null;
  nationality: string | null;
  religion: string | null;
  bloodType: string | null;
  hireDate: string;
  status: string;
  photoUrl: string | null;
  departmentId: string | null;
  positionId: string | null;
  locationId: string | null;
  biometricId: string | null;
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
    email: string | null;
    address: string | null;
    birthDate: string | null;
    isPrimary: boolean;
  }[];
  education: {
    id: string;
    level: string;
    school: string;
    degree: string | null;
    fieldOfStudy: string | null;
    startYear: number | null;
    endYear: number | null;
    honors: string | null;
  }[];
  workHistory: {
    id: string;
    employer: string;
    position: string | null;
    startDate: string | null;
    endDate: string | null;
    reasonForLeaving: string | null;
  }[];
  training: {
    id: string;
    title: string;
    provider: string | null;
    startDate: string | null;
    endDate: string | null;
    hours: string | null;
    certificateNo: string | null;
  }[];
  requirements: {
    id: string;
    requirement: string;
    status: string;
    submittedOn: string | null;
    notes: string | null;
  }[];
  // Metadata only — never `content`/`checksum`. Downloading the bytes goes through GET
  // /api/files/[documentId], never this payload (see resolve-document-for-download.ts).
  documents: {
    id: string;
    kind: string;
    requirementId: string | null;
    documentType: string | null;
    filename: string;
    mimeType: string;
    byteSize: number;
    createdAt: string;
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
  const educationRows = await tenantDb.select().from(employeeEducation).where(eq(employeeEducation.employeeId, employeeId));
  const workHistoryRows = await tenantDb
    .select()
    .from(employeeWorkHistory)
    .where(eq(employeeWorkHistory.employeeId, employeeId));
  const trainingRows = await tenantDb.select().from(employeeTraining).where(eq(employeeTraining.employeeId, employeeId));
  const requirementRows = await tenantDb
    .select()
    .from(employeeRequirements)
    .where(eq(employeeRequirements.employeeId, employeeId));
  const documentRows = await tenantDb
    .select({
      id: employeeDocuments.id,
      kind: employeeDocuments.kind,
      requirementId: employeeDocuments.requirementId,
      documentType: employeeDocuments.documentType,
      filename: employeeDocuments.filename,
      mimeType: employeeDocuments.mimeType,
      byteSize: employeeDocuments.byteSize,
      createdAt: employeeDocuments.createdAt,
    })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.employeeId, employeeId));
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
    permanentAddress: employee.permanentAddress,
    birthPlace: employee.birthPlace,
    nationality: employee.nationality,
    religion: employee.religion,
    bloodType: employee.bloodType,
    hireDate: employee.hireDate,
    status: employee.status,
    photoUrl: employee.photoUrl,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    locationId: employee.locationId,
    biometricId: employee.biometricId,
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
      email: row.email,
      address: row.address,
      birthDate: row.birthDate,
      isPrimary: row.isPrimary,
    })),
    education: educationRows.map((row) => ({
      id: row.id,
      level: row.level,
      school: row.school,
      degree: row.degree,
      fieldOfStudy: row.fieldOfStudy,
      startYear: row.startYear,
      endYear: row.endYear,
      honors: row.honors,
    })),
    workHistory: workHistoryRows.map((row) => ({
      id: row.id,
      employer: row.employer,
      position: row.position,
      startDate: row.startDate,
      endDate: row.endDate,
      reasonForLeaving: row.reasonForLeaving,
    })),
    training: trainingRows.map((row) => ({
      id: row.id,
      title: row.title,
      provider: row.provider,
      startDate: row.startDate,
      endDate: row.endDate,
      hours: row.hours,
      certificateNo: row.certificateNo,
    })),
    requirements: requirementRows.map((row) => ({
      id: row.id,
      requirement: row.requirement,
      status: row.status,
      submittedOn: row.submittedOn,
      notes: row.notes,
    })),
    documents: documentRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      requirementId: row.requirementId,
      documentType: row.documentType,
      filename: row.filename,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
