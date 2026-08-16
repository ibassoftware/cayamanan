// A small, single-purpose Mastra agent backing employee.suggestColumnMapping — asked
// about only the header columns `mapColumns()` (import-columns.ts) left unresolved, never
// the ones it already matched deterministically. This is a classification/extraction task
// (map a column header + a few sample values to one of a fixed, known field list), the
// cheapest tier "Model choice" (CLAUDE.md) calls for — not a candidate for a stronger
// reasoning model.
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

import { IMPORT_FIELDS, type ImportField } from '@/modules/employee/service/import-columns';

// Same model id missy-agent.ts/weather-agent.ts use — this deployment's model router
// exposes exactly one model, so the cost lever available here is reasoning effort (kept
// at the provider default / low end via the plain string form below), not a different,
// cheaper model id that doesn't exist in this environment. If a genuinely cheaper model
// is ever added to the router, this is the one place to point at it.
const COLUMN_MAPPING_MODEL = 'openai/gpt-5.6-luna';

const COLUMN_MAPPING_INSTRUCTIONS = `You map spreadsheet column headers from an HR employee-import file to a fixed list of
employee fields.

You will be given: (1) the exact list of allowed destination fields, and (2) one or more
columns you must map, each with its header text and up to 3 sample cell values from that
column.

Rules:
- Every "field" you return must be exactly one of the allowed field names given to you, or
  null if no field genuinely fits. Never invent a field name that wasn't given to you.
- Map each column to at most one field, and never map two different columns to the same
  field — if two columns both look like they could be the same field, pick the one you are
  more confident about and return null for the other.
- Use the sample values as evidence (e.g. a column full of dates suggests a date field, a
  column of "MALE"/"FEMALE" suggests a sex field) — but the header text is the primary
  signal; sample values disambiguate, they don't override an unrelated header.
- Set confidence to "high" only when the mapping is unambiguous; otherwise "low". When you
  return field: null, confidence is always "low".
- Return exactly one result per column you were asked about, using its exact header text.`;

export const columnMappingAgent = new Agent({
  id: 'column-mapping',
  name: 'Column Mapping',
  instructions: COLUMN_MAPPING_INSTRUCTIONS,
  model: COLUMN_MAPPING_MODEL,
});

// `field` is constrained to the real field list at the schema level (never an open
// string) — "prefer structured outputs with explicit schemas" (CLAUDE.md). This is belt;
// the suspenders is `isImportField` re-checked independently by the caller below, since a
// schema is only as strong as the provider's enforcement of it.
const modelResponseSchema = z.object({
  mappings: z.array(
    z.object({
      column: z.string(),
      field: z.enum(IMPORT_FIELDS).nullable(),
      confidence: z.enum(['high', 'low']),
    }),
  ),
});

export interface UnmappedColumnSample {
  column: string;
  /** Up to 3 sample cell values for this column, empty cells already excluded — never a
   * full row, and never a column the deterministic pass already resolved. */
  samples: string[];
}

export interface ModelColumnMapping {
  column: string;
  field: ImportField | null;
  confidence: 'high' | 'low';
}

function buildPrompt(columns: UnmappedColumnSample[]): string {
  const columnLines = columns
    .map((c, i) => `${i + 1}. Header: ${JSON.stringify(c.column)} — sample values: ${JSON.stringify(c.samples)}`)
    .join('\n');
  return `Allowed fields: ${IMPORT_FIELDS.join(', ')}\n\nColumns to map:\n${columnLines}`;
}

/**
 * Calls the model for exactly the unmapped columns the caller passes in — an empty array
 * short-circuits without a call. `tracingOptions: { hideInput: true, hideOutput: true }`
 * hides this call's input/output on every span Mastra records for it, independent of (and
 * in addition to) the key/free-text redaction `src/mastra/index.ts`'s Observability config
 * applies to every other trace — sample employee cell values (birth dates, emails, phone
 * numbers) never reach trace storage at all for this call, not merely redacted there. See
 * `@mastra/core`'s `TracingOptions` for the mechanism.
 *
 * Returns the model's own claims verbatim (already schema-constrained to `IMPORT_FIELDS`
 * by `modelResponseSchema`) — `employee.suggestColumnMapping`'s handler is the boundary
 * that independently re-checks every `field` against `isImportField` before it reaches an
 * output a client ever sees, exactly as if this schema constraint didn't exist.
 */
export async function suggestUnmappedColumns(
  columns: UnmappedColumnSample[],
  apiKey: string | undefined,
): Promise<ModelColumnMapping[]> {
  if (columns.length === 0) return [];

  const result = await columnMappingAgent.generate(buildPrompt(columns), {
    structuredOutput: { schema: modelResponseSchema },
    model: apiKey ? { id: COLUMN_MAPPING_MODEL, apiKey } : COLUMN_MAPPING_MODEL,
    tracingOptions: { hideInput: true, hideOutput: true },
  });

  return result.object?.mappings ?? [];
}
