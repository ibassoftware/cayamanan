import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { employeeDocuments } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    documentId: z.string().uuid().describe('Document id to remove.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo);

export const removeDocumentAction = defineAction({
  id: 'employee.removeDocument',
  title: 'Remove employee document',
  input: inputSchema,
  output: z.object({ id: z.string().uuid() }),
  read: false,
  // Ordinary, not high: this is a checklist/photo attachment, not salary/bank/termination
  // — but still audited (hard delete, prior value unrecoverable — CLAUDE.md's audit list
  // is a floor, not a ceiling, same rationale as update-government-ids.ts).
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'Permanently delete one uploaded document from an employee’s 201 file. Identify the employee by employeeNo whenever you have it. This cannot be undone.',
  async handler(input, ctx) {
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    // Verifies the row actually belongs to the resolved employee — a documentId for
    // another employee (even within the same company) must not resolve here, exactly
    // like remove-education.ts/remove-requirement.ts's identical row-ownership check.
    const [existing] = await ctx.db
      .select({
        id: employeeDocuments.id,
        kind: employeeDocuments.kind,
        requirementId: employeeDocuments.requirementId,
        documentType: employeeDocuments.documentType,
        filename: employeeDocuments.filename,
        mimeType: employeeDocuments.mimeType,
        byteSize: employeeDocuments.byteSize,
        checksum: employeeDocuments.checksum,
      })
      .from(employeeDocuments)
      .where(and(eq(employeeDocuments.id, input.documentId), eq(employeeDocuments.employeeId, employee.id)))
      .limit(1);
    if (!existing) {
      throw new ActionError('NOT_FOUND', 'Document not found for this employee.');
    }

    await ctx.db.delete(employeeDocuments).where(eq(employeeDocuments.id, existing.id));

    ctx.audit({
      entityType: 'employee_documents',
      entityId: existing.id,
      before: existing,
      after: null,
    });

    return { id: existing.id };
  },
});
