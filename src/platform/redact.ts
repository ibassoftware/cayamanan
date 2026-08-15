// Shared log/error redactor — §4.5. Strips known-sensitive keys before an object is
// logged. Matches case-insensitively; `bank*`, `sss*`, `philhealth*`, `pagibig*`,
// `password*` match by prefix (e.g. `bankAccountNumber`, `sss_number`, `passwordHash`),
// the rest match the whole key name.
const EXACT_KEYS = new Set(['salary', 'rate', 'tin', 'birthdate', 'address']);
const PREFIX_KEYS = ['bank', 'sss', 'philhealth', 'pagibig', 'password'];

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (EXACT_KEYS.has(normalized)) return true;
  return PREFIX_KEYS.some((prefix) => normalized.startsWith(prefix));
}

// Free-text values (error messages, DB driver `detail` strings, etc.) can leak sensitive
// data inline — e.g. a Postgres constraint-violation message literally quoting the
// offending column value — where no sensitive *key* is present for `isSensitiveKey`
// above to catch. Tokenize on non-letter boundaries and re-use the same key vocabulary:
// if any token in the string looks like a sensitive field name, redact the whole string
// rather than trying to surgically excise just the value (safer, and simple).
function stringContainsSensitiveToken(value: string): boolean {
  const tokens = value.split(/[^a-zA-Z]+/).filter(Boolean);
  return tokens.some((token) => isSensitiveKey(token));
}

/**
 * Deep-clones `value`, replacing any object key that matches a known-sensitive name
 * (case-insensitive) with `"[REDACTED]"`, and any bare string that itself contains a
 * sensitive-looking token (e.g. an error message mentioning `salary`/`bankAccountNumber`)
 * with `"[REDACTED]"` in full. Safe to call on arbitrary log payloads — including a
 * caught error's `.message` — before they reach stdout/stderr or an error report.
 */
export function redact<T>(value: T): T {
  return redactInternal(value, new WeakSet()) as T;
}

function redactInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return stringContainsSensitiveToken(value) ? REDACTED : value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, seen));
  }

  if (value instanceof Date) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactInternal(val, seen);
  }
  return output;
}
