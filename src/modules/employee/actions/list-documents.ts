import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { employeeDocuments } from '../schema';
import { resolveEmployee } from '../service/employee-selector';

// Metadata only — `content` is never selected here, let alone returned (see
// tests/employee-documents.test.ts's "never returns content" assertion). Downloading the
// actual bytes goes through GET /api/files/[documentId], never this action.
const documentMetadataSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['PHOTO', 'REQUIREMENT', 'GENERAL']),
  requirementId: z.string().uuid().nullable(),
  documentType: z.string().nullable(),
  filename: z.string(),
  mimeType: z.string(),
  byteSize: z.number(),
  createdAt: z.string(),
});

// Selector is optional, not required-one-of like every other employee.* action: an
// ADMIN/HR_PAYROLL caller supplies it to look up an arbitrary employee (in-company, via
// resolveEmployee's own tenant+company scoping); an EMPLOYEE caller supplies nothing at
// all, mirroring employee.getSelf — see the handler below for why a selector from an
// EMPLOYEE-only caller is never honored, not merely optional.
const inputSchema = z
  .object({
    employeeId: z.string().uuid().describe('UUID; prefer employeeNo if known.').optional(),
    employeeNo: z.string().min(1).describe('Natural key; prefer over employeeId.').optional(),
  })
  .strict();

export const listDocumentsAction = defineAction({
  id: 'employee.listDocuments',
  title: 'List employee documents',
  input: inputSchema,
  output: z.object({ documents: z.array(documentMetadataSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  // Not a clean 'company'/'self' split: ADMIN/HR_PAYROLL use this company-scoped (any
  // in-company employee, via the selector), EMPLOYEE uses it self-scoped (their own
  // record only, selector ignored). One action id serves both audiences rather than a
  // parallel employee.listMyDocuments — the handler enforces the split explicitly below,
  // the same way employee.getSelf never lets scope:'self' be widened by input.
  scope: 'company',
  toolExposed: true,
  toolDescription:
    'List an employee’s uploaded documents (photo/requirement attachments) — filenames and metadata only, never file content. Identify the employee by employeeNo when acting as admin/HR; an EMPLOYEE caller always sees only their own.',
  async handler(input, ctx) {
    const isPrivileged = ctx.roles.includes('ADMIN') || ctx.roles.includes('HR_PAYROLL');

    let employeeId: string;
    if (isPrivileged) {
      if (input.employeeId !== undefined || input.employeeNo !== undefined) {
        const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);
        employeeId = employee.id;
      } else if (ctx.employeeId) {
        employeeId = ctx.employeeId;
      } else {
        throw new ActionError('VALIDATION_ERROR', 'Provide employeeId or employeeNo to identify the employee.', {
          field: 'employeeId',
        });
      }
    } else {
      // An EMPLOYEE-only caller never gets to name someone else: any employeeId/employeeNo
      // it supplied is discarded outright, not merely unused — ctx.employeeId always comes
      // from the verified session (see platform/actions.ts), never from input.
      if (!ctx.employeeId) {
        throw new ActionError('NOT_FOUND', 'No employee record is linked to your account.');
      }
      employeeId = ctx.employeeId;
    }

    const rows = await ctx.db
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

    return {
      documents: rows.map((row) => ({
        id: row.id,
        kind: row.kind as 'PHOTO' | 'REQUIREMENT' | 'GENERAL',
        requirementId: row.requirementId,
        documentType: row.documentType,
        filename: row.filename,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
});
