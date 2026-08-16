import { z } from 'zod';

import { defineAction, executeAction, type VerifiedSession } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { importFileSourceSchema, importMappingSchema, prepareImportRows, type ResolvedImportSource } from '../service/import-source';
import { planUpserts } from '../service/bulk-upsert';

const rowResultSchema = z.object({
  rowNumber: z.number().int(),
  employeeNo: z.string().nullable(),
  operation: z.enum(['CREATE', 'UPDATE', 'ERROR']),
  values: z.record(z.string(), z.unknown()),
  errors: z.array(z.string()),
});

/**
 * Resolves an `{ kind: 'attachment' }` source to its staged text via a nested
 * `executeAction('ai.getAttachment', ...)` — a runtime registry dispatch, not a static
 * import, so `src/modules/employee/**` never imports from `src/modules/ai/**` (see
 * `service/import-source.ts`'s header comment for why that specific direction would be a
 * module cycle). Every other source kind passes through unchanged.
 */
async function resolveSource(
  source: z.infer<typeof importFileSourceSchema>,
  ctx: { tenantId: string; companyId: string; userId: string | null; employeeId?: string | null; roles: VerifiedSession['roles']; sessionId: string | null },
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

export const importPreviewAction = defineAction({
  id: 'employee.importPreview',
  title: 'Preview employee import',
  input: z
    .object({
      source: importFileSourceSchema,
      mapping: importMappingSchema,
    })
    .strict(),
  output: z.object({
    rows: z.array(rowResultSchema),
    summary: z.object({ toCreate: z.number().int(), toUpdate: z.number().int(), withErrors: z.number().int() }),
  }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  // A whole file's content (or a mapping wizard's intermediate state) has no business in
  // a Missy tool-call payload (unbounded size, and every tool schema is sent to the model
  // on every request — see tests/missy-tool-payload.test.ts). The conversational bulk
  // path is employee.bulkUpsert, which takes structured rows the model actually reasoned
  // about, not an opaque file blob.
  toolExposed: false,
  async handler(input, ctx) {
    const resolvedSource = await resolveSource(input.source, ctx);

    const prepared = await prepareImportRows(resolvedSource, input.mapping);
    if (!prepared.ok) {
      throw new ActionError(prepared.error.code, prepared.error.message, {
        field: prepared.error.field,
        details: prepared.error.details,
      });
    }

    // Read-only by construction: planUpserts only selects, and this handler returns
    // before anything resembling a write is even reachable. There is no code path in
    // this action that inserts or updates a row.
    const planned = await planUpserts(ctx.db, ctx.tenantId, ctx.companyId, prepared.data.candidates);

    const summary = {
      toCreate: planned.filter((row) => row.operation === 'CREATE').length,
      toUpdate: planned.filter((row) => row.operation === 'UPDATE').length,
      withErrors: planned.filter((row) => row.operation === 'ERROR').length,
    };

    return {
      rows: planned.map((row) => ({
        rowNumber: row.rowNumber,
        employeeNo: row.employeeNo,
        operation: row.operation,
        values: row.values,
        errors: row.errors,
      })),
      summary,
    };
  },
});
