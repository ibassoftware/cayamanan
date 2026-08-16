import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { employeeDocuments, employeeRequirements } from '../schema';
import { employeeIdOrNoShape, requireEmployeeIdOrNo, resolveEmployee } from '../service/employee-selector';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BASE64_LENGTH, validateDocumentUpload } from '../service/document-validation';

// Reuses the existing action layer (JSON through POST /api/actions/[actionId]) rather
// than a bespoke multipart upload route — the action layer already gives role checks,
// tenant scoping, audit and the single-mutation-endpoint invariant (00-overview.md
// §4.3); a new upload endpoint would need all of that rebuilt for one action. Base64-in-
// JSON costs ~33% payload inflation over the raw bytes, which is an acceptable trade-off
// at the 5 MB (decoded) cap this action enforces (see service/document-validation.ts).
const PHOTO_UNIQUE_CONSTRAINT = 'employee_documents_one_photo_per_employee_uidx';

function isDuplicatePhoto(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === PHOTO_UNIQUE_CONSTRAINT,
  );
}

const inputSchema = z
  .object({
    ...employeeIdOrNoShape,
    kind: z
      .enum(['PHOTO', 'REQUIREMENT', 'GENERAL'])
      .describe('PHOTO (at most one per employee), REQUIREMENT (linked to a checklist item), or GENERAL (typed by documentType).'),
    requirementId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe('Required when kind is REQUIREMENT; must be omitted/null for PHOTO/GENERAL.'),
    documentType: z
      .enum(DOCUMENT_TYPES)
      .nullable()
      .optional()
      .describe('Required when kind is GENERAL; must be omitted/null for PHOTO/REQUIREMENT.'),
    filename: z.string().min(1).describe('Display filename only — never used as a filesystem path.'),
    // The `.max()` is the load-bearing half: it rejects an oversized payload at the schema
    // boundary, before `validateDocumentUpload` decodes anything into a second buffer.
    // See MAX_DOCUMENT_BASE64_LENGTH for why the decoded-size check alone is not a limit.
    contentBase64: z
      .string()
      .min(1)
      .max(MAX_DOCUMENT_BASE64_LENGTH, 'File exceeds the 5 MB size limit.')
      .describe('Base64-encoded file content. Max 5 MB decoded. JPEG, PNG, WEBP or PDF only.'),
  })
  .strict()
  .superRefine(requireEmployeeIdOrNo)
  // Same shape the DB's employee_documents_kind_shape_check CHECK constraint enforces
  // (schema.ts) — validated here too so a bad combination is a clean VALIDATION_ERROR
  // instead of a raw constraint-violation error reaching the caller.
  .superRefine((data, ctx) => {
    if (data.kind === 'PHOTO') {
      if (data.requirementId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A PHOTO document must not reference a requirement.', path: ['requirementId'] });
      }
      if (data.documentType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A PHOTO document must not have a documentType.', path: ['documentType'] });
      }
    } else if (data.kind === 'REQUIREMENT') {
      if (!data.requirementId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A REQUIREMENT document must reference a requirement.', path: ['requirementId'] });
      }
      if (data.documentType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A REQUIREMENT document must not have a documentType.', path: ['documentType'] });
      }
    } else if (data.kind === 'GENERAL') {
      if (data.requirementId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A GENERAL document must not reference a requirement.', path: ['requirementId'] });
      }
      if (!data.documentType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A GENERAL document must have a documentType.', path: ['documentType'] });
      }
    }
  });

export const uploadDocumentAction = defineAction({
  id: 'employee.uploadDocument',
  title: 'Upload employee document',
  input: inputSchema,
  output: z.object({
    id: z.string().uuid(),
    filename: z.string(),
    mimeType: z.string(),
    byteSize: z.number(),
    documentType: z.string().nullable(),
  }),
  read: false,
  risk: 'high',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  // Never a Missy tool: a base64 file blob (up to ~6.8 MB of encoded text at the 5 MB
  // cap) has no business in a tool-call payload — it would blow up model context and
  // cost for no benefit. A file upload belongs to a real file picker in the UI, not a
  // conversational turn; nothing about this is a permission gap, since ADMIN/HR_PAYROLL
  // still perform the upload through the ordinary form, audited exactly the same way.
  toolExposed: false,
  // Display only (never resubmitted) — approval always replays the tool call's real
  // input, so this never needs to be exhaustive. Deliberately omits contentBase64/
  // byteSize (not yet decoded/validated at preview time) beyond a rough estimate, and
  // never includes file content.
  confirmationPreview(input) {
    const approxByteSize = Math.floor((input.contentBase64.length * 3) / 4);
    return { filename: input.filename, kind: input.kind, documentType: input.documentType ?? null, approxByteSize };
  },
  async handler(input, ctx) {
    // The kind/requirementId/documentType shape (PHOTO: neither; REQUIREMENT:
    // requirementId only; GENERAL: documentType only) is already enforced by inputSchema's
    // superRefine above and, as a DB-level backstop, by
    // employee_documents_kind_shape_check (schema.ts) — no redundant check needed here.
    const employee = await resolveEmployee(ctx.db, ctx.tenantId, ctx.companyId, input);

    let requirementId: string | null = null;
    if (input.kind === 'REQUIREMENT') {
      const [requirement] = await ctx.db
        .select({ id: employeeRequirements.id })
        .from(employeeRequirements)
        .where(and(eq(employeeRequirements.id, input.requirementId as string), eq(employeeRequirements.employeeId, employee.id)))
        .limit(1);
      if (!requirement) {
        throw new ActionError('NOT_FOUND', 'Requirement not found for this employee.', { field: 'requirementId' });
      }
      requirementId = requirement.id;
    }

    const validated = validateDocumentUpload({ kind: input.kind, filename: input.filename, contentBase64: input.contentBase64 });
    const documentType = input.kind === 'GENERAL' ? (input.documentType as string) : null;

    try {
      const [created] = await ctx.db
        .insert(employeeDocuments)
        .values({
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          employeeId: employee.id,
          kind: input.kind,
          requirementId,
          documentType,
          filename: validated.filename,
          mimeType: validated.mimeType,
          byteSize: validated.byteSize,
          checksum: validated.checksum,
          content: validated.content,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();

      // Filename/size/checksum only — never `content` (CLAUDE.md: never put PII/file data
      // in an audit row any wider than the source table already is; audit_logs is
      // readable by the same ADMIN/HR roles as employee_documents, but the raw bytes have
      // no reason to be duplicated into a second table).
      ctx.audit({
        entityType: 'employee_documents',
        entityId: created.id,
        before: null,
        after: {
          filename: created.filename,
          mimeType: created.mimeType,
          byteSize: created.byteSize,
          checksum: created.checksum,
          documentType: created.documentType,
        },
      });

      return {
        id: created.id,
        filename: created.filename,
        mimeType: created.mimeType,
        byteSize: created.byteSize,
        documentType: created.documentType,
      };
    } catch (error) {
      if (isDuplicatePhoto(error)) {
        throw new ActionError('CONFLICT', 'This employee already has a photo on file. Remove it before uploading a new one.', {
          field: 'kind',
        });
      }
      throw error;
    }
  },
});
