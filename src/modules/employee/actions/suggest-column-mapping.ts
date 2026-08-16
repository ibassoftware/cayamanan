import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { resolveOpenAiKey } from '@/modules/system/service/resolve-openai-key';
import { suggestUnmappedColumns } from '@/mastra/agents/column-mapping-agent';
import { IMPORT_FIELDS, isImportField, mapColumns, type ImportField } from '../service/import-columns';

const MAX_HEADER_COLUMNS = 100;
const MAX_CELL_LENGTH = 300;
// The model is only ever asked about a handful of already-unmapped columns and up to 3
// rows of evidence per column — a client claiming to have sent 500 sample rows gets
// truncated to this, never trusted at face value.
const MAX_SAMPLE_ROWS = 3;

const headerCellSchema = z.string().max(MAX_CELL_LENGTH);

export const suggestColumnMappingAction = defineAction({
  id: 'employee.suggestColumnMapping',
  title: 'Suggest a column mapping for an employee import file',
  input: z
    .object({
      header: z.array(headerCellSchema).min(1).max(MAX_HEADER_COLUMNS),
      // Generous upper bound at the schema boundary only — the handler below truncates
      // to MAX_SAMPLE_ROWS regardless of how many rows actually arrive.
      sampleRows: z.array(z.array(headerCellSchema)).max(20),
    })
    .strict(),
  output: z.object({
    mappings: z.array(
      z.object({
        column: z.string(),
        field: z.enum(IMPORT_FIELDS).nullable(),
        confidence: z.enum(['high', 'low']),
      }),
    ),
  }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'company',
  // Advisory only — never called by Missy, never itself a write. The import wizard calls
  // this directly once a file is parsed, the same way it will call
  // employee.importPreview/importCommit next.
  toolExposed: false,
  async handler(input, ctx) {
    const { header } = input;
    const sampleRows = input.sampleRows.slice(0, MAX_SAMPLE_ROWS);
    for (const row of sampleRows) {
      if (row.length !== header.length) {
        throw new ActionError(
          'VALIDATION_ERROR',
          `A sample row has ${row.length} cell(s); expected ${header.length} to match the header.`,
        );
      }
    }

    // Run the deterministic pass first — only the columns it leaves unmapped are ever
    // worth a model call. A header that resolves entirely on its own (e.g. a re-export of
    // a previous import) costs nothing extra here.
    const deterministic = mapColumns(header);
    const unmappedIndexes = header.map((_, index) => index).filter((index) => deterministic.fieldByIndex[index] === null);

    const modelResultByColumn = new Map<string, { field: ImportField | null; confidence: 'high' | 'low' }>();
    if (unmappedIndexes.length > 0) {
      const apiKey = await resolveOpenAiKey({ tenantId: ctx.tenantId, companyId: ctx.companyId });
      const columnsToAsk = unmappedIndexes.map((index) => ({
        column: header[index],
        samples: sampleRows.map((row) => row[index]).filter((value) => value !== ''),
      }));

      const modelResults = await suggestUnmappedColumns(columnsToAsk, apiKey);
      for (const result of modelResults) {
        // Defense in depth, independent of column-mapping-agent.ts's own schema
        // constraint: the model must never be able to make it into this action's output
        // claiming a destination outside the real field list. Anything else is dropped
        // (nulled), never passed through on the theory that the schema already caught it.
        const field = result.field !== null && isImportField(result.field) ? result.field : null;
        modelResultByColumn.set(result.column, { field, confidence: field ? result.confidence : 'low' });
      }
    }

    // Second dedupe pass across the *combined* result: a deterministic match always wins,
    // and among model guesses only the first (in header order) claiming a given field is
    // kept — mirrors mapColumns'/resolveConfirmedMapping's "ambiguous mapping" rule, just
    // resolved here as a friendlier suggestion rather than a hard rejection, since nothing
    // has been confirmed yet.
    const usedFields = new Set<ImportField>();
    const mappings = header.map((column, index) => {
      const deterministicField = deterministic.fieldByIndex[index];
      if (deterministicField !== null) {
        usedFields.add(deterministicField);
        return { column, field: deterministicField, confidence: 'high' as const };
      }

      const guess = modelResultByColumn.get(column);
      if (!guess || guess.field === null || usedFields.has(guess.field)) {
        return { column, field: null, confidence: 'low' as const };
      }
      usedFields.add(guess.field);
      return { column, field: guess.field, confidence: guess.confidence };
    });

    return { mappings };
  },
});
