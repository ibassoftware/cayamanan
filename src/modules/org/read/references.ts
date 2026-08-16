// Public read-model exports other modules may import (00-overview.md §4.1: "A module
// may import another module's read/ and service/ public exports. It may never import
// another module's schema.ts or query another module's tables directly.").
//
// The `employee` module uses these to (a) validate that a department/position/location
// id supplied to employee.create/update actually belongs to the caller's tenant+company
// — Postgres FK constraints alone only prove the id exists *somewhere*, never that it's
// in-scope for this company — and (b) resolve id -> code/name for display on
// employee.get/employee.list without querying `departments`/`positions`/`locations`
// directly from employee/actions/*.ts.
import { and, eq, inArray } from 'drizzle-orm';

import type { ScopedDb } from '@/platform/db';
import { departments, locations, positions } from '../schema';

export interface DepartmentRef {
  id: string;
  code: string;
  name: string;
}

export interface PositionRef {
  id: string;
  code: string;
  title: string;
}

export interface LocationRef {
  id: string;
  code: string;
  name: string;
}

function uniqueIds(ids: (string | null | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

export async function getDepartmentsByIds(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  ids: (string | null | undefined)[],
): Promise<Map<string, DepartmentRef>> {
  const wanted = uniqueIds(ids);
  if (wanted.length === 0) return new Map();
  const rows = await tenantDb
    .select({ id: departments.id, code: departments.code, name: departments.name })
    .from(departments)
    .where(
      and(eq(departments.tenantId, tenantId), eq(departments.companyId, companyId), inArray(departments.id, wanted)),
    );
  return new Map(rows.map((row) => [row.id, row]));
}

export async function getPositionsByIds(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  ids: (string | null | undefined)[],
): Promise<Map<string, PositionRef>> {
  const wanted = uniqueIds(ids);
  if (wanted.length === 0) return new Map();
  const rows = await tenantDb
    .select({ id: positions.id, code: positions.code, title: positions.title })
    .from(positions)
    .where(and(eq(positions.tenantId, tenantId), eq(positions.companyId, companyId), inArray(positions.id, wanted)));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function getLocationsByIds(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  ids: (string | null | undefined)[],
): Promise<Map<string, LocationRef>> {
  const wanted = uniqueIds(ids);
  if (wanted.length === 0) return new Map();
  const rows = await tenantDb
    .select({ id: locations.id, code: locations.code, name: locations.name })
    .from(locations)
    .where(and(eq(locations.tenantId, tenantId), eq(locations.companyId, companyId), inArray(locations.id, wanted)));
  return new Map(rows.map((row) => [row.id, row]));
}
