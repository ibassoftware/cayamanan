// The employee.* actions' shared "identify by employeeId or employeeNo" wiring onto the
// platform id-or-key primitive (@/platform/id-or-key — see its header comment for the
// general contract this module is a consumer of, not a re-implementation of).
//
// `employee_no` is `UNIQUE (tenant_id, company_id, employee_no)` at the DB level (see
// drizzle/0006_organization_employee_master_data.sql's `employees_tenant_company_employee_no_uidx`)
// — `keyIsUnique: true` below is a documented fact, not an assumption. Unlike org's
// `code`, `employeeNo` is immutable after creation (employee.update's schema has no
// `employeeNo` field at all — see its header comment), so there is no "also a mutable
// field" concern here: every employee.* action below gets full "both supplied must
// resolve to the same employee, or reject" reconciliation (`keyIsAlsoMutableField` stays
// unset/false).
import { idOrKeyShape, requireIdOrKey, resolveByIdOrKey, type NaturalKeySelectorConfig } from '@/platform/id-or-key';
import type { ScopedDb } from '@/platform/db';
import { employees } from '../schema';

export const EMPLOYEE_SELECTOR: NaturalKeySelectorConfig = {
  table: employees,
  idColumn: employees.id,
  idField: 'employeeId',
  keyColumn: employees.employeeNo,
  tenantIdColumn: employees.tenantId,
  companyIdColumn: employees.companyId,
  keyField: 'employeeNo',
  entityLabel: 'Employee',
  keyIsUnique: true,
};

/** Spread into an action's input shape: `z.object({ ...employeeIdOrNoShape, ... })`. */
export const employeeIdOrNoShape = idOrKeyShape('employeeId', 'employeeNo');

/** Chain onto `.strict().superRefine(requireEmployeeIdOrNo)`. */
export const requireEmployeeIdOrNo = requireIdOrKey('employeeId', 'employeeNo');

/** Resolves `{ employeeId?, employeeNo? }` to the full employee row — see
 * `resolveByIdOrKey`'s doc comment for the reconciliation contract. */
export async function resolveEmployee(
  db: ScopedDb,
  tenantId: string,
  companyId: string,
  selector: Record<string, unknown>,
): Promise<typeof employees.$inferSelect> {
  return resolveByIdOrKey<typeof employees.$inferSelect>(db, tenantId, companyId, EMPLOYEE_SELECTOR, selector);
}
