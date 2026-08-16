// Validates the (optional) department/position/location ids on employee.create/update
// actually belong to the caller's tenant+company, via org's public `read/` export — never
// by querying `departments`/`positions`/`locations` directly from this module (see
// schema.ts header comment). A real DB foreign key (added in the migration) only proves
// the id exists *somewhere*; this is what prevents a caller from assigning an employee to
// another company's department.
import { ActionError } from '@/platform/errors';
import type { ScopedDb } from '@/platform/db';
import { getDepartmentsByIds, getLocationsByIds, getPositionsByIds } from '@/modules/org/read/references';

export interface AssignmentInput {
  departmentId?: string | null;
  positionId?: string | null;
  locationId?: string | null;
}

/** Throws a field-level VALIDATION_ERROR if any supplied id doesn't resolve in-scope. */
export async function assertAssignmentInScope(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  input: AssignmentInput,
): Promise<void> {
  // Sequential, not Promise.all: `tenantDb` is a single connection bound to the caller's
  // transaction (see withTenantContext) — issuing overlapping queries on the same client
  // is unsafe (node-postgres warns and effectively serializes them anyway).
  const departmentsById = await getDepartmentsByIds(tenantDb, tenantId, companyId, [input.departmentId]);
  const positionsById = await getPositionsByIds(tenantDb, tenantId, companyId, [input.positionId]);
  const locationsById = await getLocationsByIds(tenantDb, tenantId, companyId, [input.locationId]);

  if (input.departmentId && !departmentsById.has(input.departmentId)) {
    throw new ActionError('VALIDATION_ERROR', 'Department not found.', { field: 'departmentId' });
  }
  if (input.positionId && !positionsById.has(input.positionId)) {
    throw new ActionError('VALIDATION_ERROR', 'Position not found.', { field: 'positionId' });
  }
  if (input.locationId && !locationsById.has(input.locationId)) {
    throw new ActionError('VALIDATION_ERROR', 'Location not found.', { field: 'locationId' });
  }
}
