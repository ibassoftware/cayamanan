import { describe, expect, it } from 'vitest';

import { missyAgent } from '@/mastra/agents/missy-agent';
import { missyWorkingMemorySchema } from '@/mastra/agents/missy-working-memory';

// Schema-constrained working memory (see missy-working-memory.ts's header for the full
// rationale). These tests exist to catch two very different regressions:
//   1. The shape drifting to allow something it was designed to exclude (a data cache, a
//      free-text escape hatch, a PII field) — the whole point of `schema` over `template`
//      is that this becomes a validation failure, not a discouraged pattern.
//   2. The agent's wiring drifting away from the deliberate scope/enabled choice recorded
//      as comments in missy-agent.ts, silently, the same way the original defect happened
//      (a config value nobody meant to leave at its default).
describe('Missy working memory schema', () => {
  it('accepts a realistic focus + active task update', () => {
    const result = missyWorkingMemorySchema.safeParse({
      focus: { entityType: 'employee', entityId: 'emp_123' },
      activeTask: { summary: 'Onboarding: employee created, next set government IDs, then link user account.' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts both fields absent or explicitly null (nothing in focus, no active task)', () => {
    expect(missyWorkingMemorySchema.safeParse({}).success).toBe(true);
    expect(missyWorkingMemorySchema.safeParse({ focus: null, activeTask: null }).success).toBe(true);
  });

  it('rejects an invented top-level section — the exact failure mode of the old free-text template', () => {
    const result = missyWorkingMemorySchema.safeParse({
      focus: { entityType: 'employee', entityId: 'emp_123' },
      conversationContext: 'Active departments: Executive (EXEC), Engineering (ENG)...',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an entityType outside the closed set — the model cannot invent a new category', () => {
    const result = missyWorkingMemorySchema.safeParse({
      focus: { entityType: 'payrollRun', entityId: 'run_1' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a name (or any extra field) inside focus — it is a pointer, never a cache', () => {
    const result = missyWorkingMemorySchema.safeParse({
      focus: { entityType: 'employee', entityId: 'emp_123', name: 'Maria Santos' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects field values that do not belong here at all — salary, bank details, government IDs', () => {
    const result = missyWorkingMemorySchema.safeParse({
      focus: { entityType: 'employee', entityId: 'emp_123' },
      salary: 50000,
      bankAccountNumber: '1234567890',
      governmentIds: { sss: '01-2345678-9' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a task summary long enough to become a conversation transcript', () => {
    const result = missyWorkingMemorySchema.safeParse({
      activeTask: { summary: 'x'.repeat(241) },
    });
    expect(result.success).toBe(false);
  });
});

describe('Missy agent — working memory wiring', () => {
  it('is schema-constrained, thread-scoped, and off by default (deliberate — see missy-agent.ts)', async () => {
    const memory = await missyAgent.getMemory();
    expect(memory).toBeDefined();

    const merged = memory!.getMergedThreadConfig();
    expect(merged.workingMemory?.scope).toBe('thread');
    expect(merged.workingMemory?.enabled).toBe(false);
    // Same schema instance as the exported one — not a structurally-similar copy that could
    // silently drift from the excluded-fields contract documented on it.
    expect(merged.workingMemory && 'schema' in merged.workingMemory ? merged.workingMemory.schema : undefined).toBe(
      missyWorkingMemorySchema,
    );
  });
});
