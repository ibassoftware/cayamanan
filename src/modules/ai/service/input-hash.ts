// Stable (key-order-independent) hash of a parsed action input — what an
// `ai_confirmations` row is bound to (03-missy-foundation.md: "single-use token bound to
// a hash of the serialized input"). Re-derived at approval time from the caller-resubmitted
// input and compared to the stored hash, so approving with different values than were
// proposed fails, without the server needing to retain the (potentially sensitive) input
// itself at rest.
import { createHash } from 'node:crypto';

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashInput(input: unknown): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
}
