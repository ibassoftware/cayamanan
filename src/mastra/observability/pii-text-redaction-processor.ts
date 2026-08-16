// Guardrail: "PII redaction on anything reaching logs/observability"
// (03-missy-foundation.md), verified end to end by tests/missy-agent-live.test.ts.
//
// Mastra's own `SensitiveDataFilter` (src/mastra/index.ts) redacts by *exact key match*
// only — it catches a field literally named `email`/`salary`/etc., but not the same value
// sitting in free text, which is exactly what a trace looks like once the model narrates
// a tool's output back to the user (e.g. "You are jane@example.com" as plain response
// text, with no "email" key anywhere near it). This processor reuses the platform's own
// `redact()` (src/platform/redact.ts — the same function every application log line goes
// through) so a span's input/output/attributes/metadata get the identical email-regex +
// sensitive-token scrubbing, deterministically, not by asking the model to avoid saying
// the value (criterion 7 requires the *trace* to be clean regardless of what the model
// says).
import type { SpanOutputProcessor } from '@mastra/core/observability';
import { redact } from '@/platform/redact';

// AnySpan's exact shape isn't imported here — only the handful of fields
// SensitiveDataFilter itself also touches (see @mastra/observability's own
// sensitive-data-filter.ts) are read/written, kept loosely typed since this must accept
// whatever shape any span type takes.
interface RedactableSpan {
  attributes?: unknown;
  metadata?: unknown;
  input?: unknown;
  output?: unknown;
  errorInfo?: unknown;
}

export const piiTextRedactionProcessor: SpanOutputProcessor = {
  name: 'hris-pii-text-redaction',
  process(span) {
    if (!span) return span;
    const redactable = span as unknown as RedactableSpan;
    redactable.attributes = redact(redactable.attributes);
    redactable.metadata = redact(redactable.metadata);
    redactable.input = redact(redactable.input);
    redactable.output = redact(redactable.output);
    redactable.errorInfo = redact(redactable.errorInfo);
    return span;
  },
  async shutdown() {
    // No resources held.
  },
};
