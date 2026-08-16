// Shared log/error redactor — §4.5. Strips known-sensitive keys before an object is
// logged. Matches case-insensitively; `bank*`, `sss*`, `philhealth*`, `pagibig*`,
// `password*` match by prefix (e.g. `bankAccountNumber`, `sss_number`, `passwordHash`),
// the rest match the whole key name.
// `apikey`/`openaiapikey` cover the OpenAI key resolved per-request into Mastra's
// `RequestContext` (src/mastra/agents/missy-agent.ts) — that context's own
// `serializeForSpan()` only hard-codes redaction of Mastra's own auth-token key, so an
// arbitrary string value we `.set()` on it (like this one) is otherwise passed through
// as-is to any observability span that ever records the full context. Listed here so it
// flows into Mastra's `SensitiveDataFilter` too (src/mastra/index.ts spreads
// `SENSITIVE_KEY_VOCABULARY` into `sensitiveFields`), which matches whole normalized
// keys only — see the leak-check note in the task report for why this is defence in
// depth rather than the primary guard (the resolved model config itself is excluded
// from span serialization by Mastra's own `ModelRouterLanguageModel.serializeForSpan`).
const EXACT_KEYS = new Set([
  'salary',
  'rate',
  'tin',
  'birthdate',
  'address',
  'email',
  'apikey',
  'openaiapikey',
]);
// `hdmf` covers `hdmfMid`, `mobile` covers `mobile`/`mobileNumber` — both are
// employee PII (employee_government_ids.hdmf_mid, employees.mobile,
// employee_contacts.mobile) and neither matched any entry before.
const PREFIX_KEYS = ['bank', 'sss', 'philhealth', 'pagibig', 'password', 'hdmf', 'mobile'];

/**
 * Single source of truth for this HRIS's own PII/payroll vocabulary, re-used by
 * Mastra's `SensitiveDataFilter` (src/mastra/index.ts) so trace redaction and log
 * redaction cannot drift apart. Note `SensitiveDataFilter` matches whole keys only,
 * so it will catch `tin` but not `hdmfMid` — the prefix-aware `redact()` below,
 * applied by the span output processor, is what covers the suffixed variants.
 */
export const SENSITIVE_KEY_VOCABULARY: readonly string[] = [
  ...EXACT_KEYS,
  ...PREFIX_KEYS,
];

const REDACTED = '[REDACTED]';

// Email addresses show up in free text (a model narrating a tool's own output back to
// the user, e.g. "you are jane@example.com") where no *key* named "email" is present for
// `isSensitiveKey` to catch — this is exactly the shape observability traces take
// (03-missy-foundation.md criterion 7: "no email, salary, or bank values"), so string
// values are scrubbed for this pattern regardless of which key holds them.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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
    // Email addresses are scrubbed in place first (a string can be otherwise-safe prose
    // that merely happens to contain one), then the *remaining* text is still checked for
    // a sensitive token — a combined message like "contact jane@example.com about her
    // salary" ends up fully redacted, not just missing the address.
    const withoutEmails = value.replace(EMAIL_RE, REDACTED);
    return stringContainsSensitiveToken(withoutEmails) ? REDACTED : withoutEmails;
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
