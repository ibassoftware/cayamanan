// Depth-limiting and cycle-prevention for the self-referencing `departments` tree
// (04-organization-employees.md: "self-referencing tree, depth-limited"). Pure domain
// logic, no HTTP/session — imported only by org.createDepartment/updateDepartment.
import { and, eq } from 'drizzle-orm';

import type { ScopedDb } from '@/platform/db';
import { departments } from '../schema';

// Five levels (root..depth 4) comfortably covers any real org chart in MVP scope and
// keeps the ancestor walk below bounded and cheap; a genuine need for deeper nesting is
// a product decision, not something to silently allow because no one added a check.
export const MAX_DEPARTMENT_DEPTH = 5;

/**
 * Resolves the depth a department would have under `parentId` — `0` for a root
 * (`parentId: null`), `parent.depth + 1` otherwise, or `null` if `parentId` doesn't
 * resolve to a department in this tenant/company (an invalid reference the caller must
 * reject, not silently treat as a root).
 */
export async function resolveDepth(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  parentId: string | null,
): Promise<number | null> {
  if (!parentId) return 0;
  const [parent] = await tenantDb
    .select({ depth: departments.depth })
    .from(departments)
    .where(and(eq(departments.id, parentId), eq(departments.tenantId, tenantId), eq(departments.companyId, companyId)))
    .limit(1);
  return parent ? parent.depth + 1 : null;
}

/**
 * Recomputes `depth` for every descendant of `nodeId` after `nodeId` itself was just set
 * to `newDepth` (a re-parent may have shifted the whole subtree up/down). Breadth-first,
 * bounded by `MAX_DEPARTMENT_DEPTH` levels — MVP org trees are small, so this is a plain
 * application-level fixup rather than a recursive SQL CTE.
 */
export async function recomputeSubtreeDepths(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  nodeId: string,
  newDepth: number,
): Promise<void> {
  let frontier = [{ id: nodeId, depth: newDepth }];
  for (let level = 0; level < MAX_DEPARTMENT_DEPTH + 1 && frontier.length > 0; level += 1) {
    const nextFrontier: { id: string; depth: number }[] = [];
    for (const node of frontier) {
      const children = await tenantDb
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(eq(departments.parentId, node.id), eq(departments.tenantId, tenantId), eq(departments.companyId, companyId)),
        );
      for (const child of children) {
        const childDepth = node.depth + 1;
        await tenantDb.update(departments).set({ depth: childDepth }).where(eq(departments.id, child.id));
        nextFrontier.push({ id: child.id, depth: childDepth });
      }
    }
    frontier = nextFrontier;
  }
}

/**
 * Walks up from `candidateParentId` toward the root, returning `true` if `nodeId` is
 * found on that path — i.e. re-parenting `nodeId` under `candidateParentId` would create
 * a cycle (making a node its own ancestor). Bounded by `MAX_DEPARTMENT_DEPTH + 1` hops so
 * a corrupt/cyclic row already in the table can't loop forever.
 */
export async function wouldCreateCycle(
  tenantDb: ScopedDb,
  tenantId: string,
  companyId: string,
  nodeId: string,
  candidateParentId: string,
): Promise<boolean> {
  let currentId: string | null = candidateParentId;
  for (let hop = 0; currentId && hop <= MAX_DEPARTMENT_DEPTH + 1; hop += 1) {
    if (currentId === nodeId) return true;
    const [row] = await tenantDb
      .select({ parentId: departments.parentId })
      .from(departments)
      .where(and(eq(departments.id, currentId), eq(departments.tenantId, tenantId), eq(departments.companyId, companyId)))
      .limit(1);
    currentId = row?.parentId ?? null;
  }
  return false;
}
