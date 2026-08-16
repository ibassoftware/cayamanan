import { z } from 'zod';

import { defineAction, executeAction, type VerifiedSession } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import {
  importFileSourceSchema,
  importMappingSchema,
  prepareImportRows,
  type ResolvedImportSource,
} from '../service/import-source';
import { applyPlannedUpserts, planUpserts } from '../service/bulk-upsert';
import { parseCsv } from '../service/csv';

/**
 * Resolves an `{ kind: 'attachment' }` source to its staged text via a nested
 * `executeAction('ai.getAttachment', ...)` — see import-preview.ts's copy of this same
 * helper (and service/import-source.ts's header comment) for why this lives at the
 * action layer rather than inside `service/import-source.ts` itself.
 */
async function resolveSource(
  source: z.infer<typeof importFileSourceSchema>,
  ctx: {
    tenantId: string;
    companyId: string;
    userId: string | null;
    employeeId?: string | null;
    roles: VerifiedSession['roles'];
    sessionId: string | null;
  },
): Promise<ResolvedImportSource> {
  if (source.kind !== 'attachment') return source;

  const session: VerifiedSession = {
    tenantId: ctx.tenantId,
    companyId: ctx.companyId,
    userId: ctx.userId ?? '',
    employeeId: ctx.employeeId ?? null,
    roles: ctx.roles,
    sessionId: ctx.sessionId ?? '',
  };

  const result = await executeAction('ai.getAttachment', { attachmentId: source.attachmentId }, { session });
  if (!result.ok) {
    throw new ActionError(result.error.code, result.error.message, { field: result.error.field, details: result.error.details });
  }
  const attachment = result.data as { content: string };
  return { kind: 'csv', csv: attachment.content };
}

const inputSchema = z
  .object({
    source: importFileSourceSchema,
    mapping: importMappingSchema,
  })
  .strict();

export const importCommitAction = defineAction({
  id: 'employee.importCommit',
  title: 'Import employees',
  input: inputSchema,
  output: z.object({
    created: z.number().int(),
    updated: z.number().int(),
    employeeNumbers: z.array(z.string()),
  }),
  read: false,
  risk: 'high',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  // Same reasoning as employee.importPreview — a whole file (or its mapping) has no
  // place in a tool-call payload; this is the file-upload wizard's action, not Missy's.
  toolExposed: false,
  // Counts only — never the field values, which are PII (birth date, personal email,
  // mobile, ...), and never the mapping/source, which could be an entire file's worth of
  // base64/text. The confirmation card must stay safe to render without re-parsing
  // anything, and a raw source/mapping blob is exactly what employee.importPreview's own
  // header comment already argues does not belong in a tool-call-shaped payload.
  confirmationPreview(input) {
    // `confirmationPreview` is synchronous (defineAction's own type) and this module's
    // CSV parser (unlike xlsx's, which goes through an async library and unlike an
    // attachment lookup, which is a DB read) is pure and sync — so only the `csv` source
    // kind gets an exact row count here.
    if (input.source.kind === 'csv') {
      const parsed = parseCsv(input.source.csv);
      return { rows: parsed.ok ? parsed.data.rows.length : 0 };
    }
    // xlsx/attachment: the row count isn't knowable without actually parsing the file
    // (which this preview must not do — it is display-only and runs before approval, on
    // whatever the client just submitted). The real, authoritative count is what
    // employee.importPreview already showed the user on the previous screen.
    return { rows: null };
  },
  async handler(input, ctx) {
    // Never trust a client-side preview as the write: the full source is re-resolved and
    // the mapping re-validated from scratch here, the same discipline ai.approveAction
    // already applies to a hashed input (see that action's header comment) — a preview
    // shown minutes ago could be stale against concurrent writes by the time this runs.
    const resolvedSource = await resolveSource(input.source, ctx);

    const prepared = await prepareImportRows(resolvedSource, input.mapping);
    if (!prepared.ok) {
      throw new ActionError(prepared.error.code, prepared.error.message, {
        field: prepared.error.field,
        details: prepared.error.details,
      });
    }

    const planned = await planUpserts(ctx.db, ctx.tenantId, ctx.companyId, prepared.data.candidates);

    const withErrors = planned.filter((row) => row.operation === 'ERROR');
    if (withErrors.length > 0) {
      // All-or-nothing: planUpserts never writes, so simply returning an error here —
      // instead of calling applyPlannedUpserts — is what makes this atomic. Nothing has
      // been written yet, so there is no partial write to unwind.
      throw new ActionError(
        'VALIDATION_ERROR',
        `${withErrors.length} row(s) failed validation; nothing was imported.`,
        { details: { rows: withErrors.map(({ rowNumber, employeeNo, errors }) => ({ rowNumber, employeeNo, errors })) } },
      );
    }

    const result = await applyPlannedUpserts(ctx, planned);

    ctx.audit({
      entityType: 'employee',
      entityId: null,
      before: null,
      after: { employeeNumbers: result.employeeNumbers, created: result.created, updated: result.updated },
    });

    return result;
  },
});
