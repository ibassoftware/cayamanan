// Backs GET /api/files/[documentId] (src/app/api/files/[documentId]/route.ts) — the
// app's one binary-serving endpoint. Kept out of the route file itself so the
// tenant/scope/authorization logic is directly unit-testable without constructing a real
// `NextRequest` (no other route in this codebase is HTTP-tested either — see
// tests/employee-documents.test.ts).
import { eq } from 'drizzle-orm';

import type { VerifiedSession } from '@/platform/actions';
import { withTenantContext } from '@/platform/db';
import { employeeDocuments } from '../schema';

export interface DownloadableDocument {
  id: string;
  employeeId: string;
  filename: string;
  mimeType: string;
  content: Buffer;
}

// Deliberately permissive about hyphenation/case rather than parsing strictly — this is
// only a cheap pre-filter so an obviously-malformed path segment short-circuits to the
// same "not found" response as everything else below, never a distinguishing error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves one document for download, or `null`. Runs the lookup inside
 * `withTenantContext` scoped to the caller's *own* tenant/company — RLS alone confines a
 * cross-tenant/cross-company documentId to zero rows, so this never needs (and must
 * never use) a bootstrap/superuser handle.
 *
 * Returns `null` — never a distinct "forbidden" signal — for all three of: the id
 * doesn't exist, it exists in another tenant/company (RLS hides it), and it exists but
 * an EMPLOYEE-only caller may only see their own. Collapsing these to one outcome is
 * deliberate: a response that could tell those apart would be an enumeration oracle over
 * employee records (guess/increment a documentId, learn whether an employee exists).
 */
export async function resolveDocumentForDownload(
  session: VerifiedSession,
  documentId: string,
): Promise<DownloadableDocument | null> {
  if (!UUID_RE.test(documentId)) return null;

  const row = await withTenantContext({ tenantId: session.tenantId, companyId: session.companyId }, async (tenantDb) => {
    const [document] = await tenantDb.select().from(employeeDocuments).where(eq(employeeDocuments.id, documentId)).limit(1);
    return document ?? null;
  });
  if (!row) return null;

  const isPrivileged = session.roles.includes('ADMIN') || session.roles.includes('HR_PAYROLL');
  if (!isPrivileged && row.employeeId !== session.employeeId) {
    return null;
  }

  return {
    id: row.id,
    employeeId: row.employeeId,
    filename: row.filename,
    mimeType: row.mimeType,
    content: row.content,
  };
}
