import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REASONING_EFFORT_CEILING,
  detectMessageSignals,
  extractReasoningEffortSignals,
  isReasoningEffort,
  resolveMissyReasoningEffort,
  type LooseMessage,
} from '@/mastra/agents/reasoning-effort';
import { resolveMissyModelSettings } from '@/mastra/agents/missy-agent';

function userMessage(text: string): LooseMessage {
  return { role: 'user', parts: [{ type: 'text', text }] };
}

function assistantTextMessage(text: string): LooseMessage {
  return { role: 'assistant', parts: [{ type: 'text', text }] };
}

function assistantErrorMessage(): LooseMessage {
  return {
    role: 'assistant',
    parts: [{ type: 'tool-identity.listUsers', state: 'output-available', output: { status: 'error', code: 'FORBIDDEN', message: 'nope' } }],
  };
}

function assistantTransportErrorMessage(): LooseMessage {
  return {
    role: 'assistant',
    parts: [{ type: 'tool-identity.listUsers', state: 'output-error' }],
  };
}

describe('resolveMissyReasoningEffort — deterministic heuristic', () => {
  it('a simple lookup stays at the low default (no signals)', () => {
    const signals = detectMessageSignals('What positions exist?');
    expect(signals).toEqual({ highRisk: false, analytical: false, multiStep: false });
    expect(resolveMissyReasoningEffort({ ...signals, retryAfterToolError: false })).toBe('low');
  });

  it('listing/navigation/single-entity CRUD phrasing stays low', () => {
    for (const text of ['List the departments', 'Create a new location called HQ', 'Show me the employee list', 'Navigate to settings']) {
      const signals = extractReasoningEffortSignals([userMessage(text)]);
      expect(resolveMissyReasoningEffort(signals)).toBe('low');
    }
  });

  it('a high-risk-only mention escalates one tier to medium', () => {
    const signals = extractReasoningEffortSignals([userMessage("What is Jane's bank account number?")]);
    expect(signals.highRisk).toBe(true);
    expect(resolveMissyReasoningEffort(signals)).toBe('medium');
  });

  it('an analytical-only request escalates one tier to medium', () => {
    const signals = extractReasoningEffortSignals([userMessage('Why did headcount change this quarter?')]);
    expect(signals.analytical).toBe(true);
    expect(resolveMissyReasoningEffort(signals)).toBe('medium');
  });

  it('a genuinely analytical, high-risk, multi-entity request escalates to high', () => {
    const signals = extractReasoningEffortSignals([
      userMessage(
        "Compare Jane's and Tom's salary history, explain the discrepancy, and recommend whether we should adjust payroll for either of them.",
      ),
    ]);
    expect(signals.highRisk).toBe(true);
    expect(signals.analytical).toBe(true);
    expect(resolveMissyReasoningEffort(signals)).toBe('high');
  });

  it('a multi-step, numbered-list request escalates on its own', () => {
    const text = '1. Create the employee\n2. Set their location\n3. Link their user account';
    const signals = extractReasoningEffortSignals([userMessage(text)]);
    expect(signals.multiStep).toBe(true);
    expect(resolveMissyReasoningEffort(signals)).toBe('medium');
  });

  it('a very long free-text message counts as multi-step even without list markers', () => {
    const text = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');
    const signals = detectMessageSignals(text);
    expect(signals.multiStep).toBe(true);
  });

  it('a retry after a structured tool error escalates to at least medium even for a plain follow-up', () => {
    const signals = extractReasoningEffortSignals([
      userMessage('List the employees'),
      assistantErrorMessage(),
      userMessage('try again'),
    ]);
    expect(signals.retryAfterToolError).toBe(true);
    expect(resolveMissyReasoningEffort(signals)).toBe('medium');
  });

  it('a retry after a transport-level tool error (output-error state) is also detected', () => {
    const signals = extractReasoningEffortSignals([assistantTransportErrorMessage(), userMessage('try again')]);
    expect(signals.retryAfterToolError).toBe(true);
  });

  it('a retry stacked with another signal reaches high, not just medium', () => {
    const signals = extractReasoningEffortSignals([
      assistantErrorMessage(),
      userMessage('why did that fail — can you explain?'),
    ]);
    expect(resolveMissyReasoningEffort(signals)).toBe('high');
  });

  it('an error several turns back that the conversation has moved on from does not count as a retry', () => {
    const signals = extractReasoningEffortSignals([
      assistantErrorMessage(),
      userMessage('ok, something else'),
      assistantTextMessage('Sure, happy to help with that.'),
      userMessage('list the departments'),
    ]);
    expect(signals.retryAfterToolError).toBe(false);
  });

  it('a successful ("ok") prior tool result is never mistaken for an error', () => {
    const okMessage: LooseMessage = {
      role: 'assistant',
      parts: [{ type: 'tool-system.ping', state: 'output-available', output: { status: 'ok', data: {} } }],
    };
    const signals = extractReasoningEffortSignals([okMessage, userMessage('and now?')]);
    expect(signals.retryAfterToolError).toBe(false);
  });

  it('a confirmation_required result is never mistaken for an error', () => {
    const confirmMessage: LooseMessage = {
      role: 'assistant',
      parts: [
        {
          type: 'tool-system.updateSetting',
          state: 'output-available',
          output: { status: 'confirmation_required', confirmationId: 'c1', token: 't1', actionId: 'x', title: 't', preview: {}, expiresAt: '2026-01-01' },
        },
      ],
    };
    const signals = extractReasoningEffortSignals([confirmMessage, userMessage('go ahead')]);
    expect(signals.retryAfterToolError).toBe(false);
  });

  it('never exceeds a configured ceiling, even with every signal firing plus a retry', () => {
    const signals = extractReasoningEffortSignals([
      assistantErrorMessage(),
      userMessage(
        '1. Compare Jane and Tom\'s salary\n2. Explain the bank account discrepancy\n3. Recommend whether to adjust payroll',
      ),
    ]);
    expect(resolveMissyReasoningEffort(signals, 'low')).toBe('low');
    expect(resolveMissyReasoningEffort(signals, 'medium')).toBe('medium');
    expect(resolveMissyReasoningEffort(signals, DEFAULT_REASONING_EFFORT_CEILING)).toBe('high');
  });

  it('never returns an effort weaker than "low" even with zero signals', () => {
    const signals = extractReasoningEffortSignals([]);
    expect(resolveMissyReasoningEffort(signals)).toBe('low');
  });
});

describe('isReasoningEffort', () => {
  it('accepts every documented level', () => {
    for (const level of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']) {
      expect(isReasoningEffort(level)).toBe(true);
    }
  });

  it('rejects garbage', () => {
    expect(isReasoningEffort('extreme')).toBe(false);
    expect(isReasoningEffort('')).toBe(false);
  });
});

describe('resolveMissyModelSettings — the wiring the chat route actually calls', () => {
  const originalOverride = process.env.MISSY_REASONING_EFFORT;
  const originalCeiling = process.env.MISSY_REASONING_EFFORT_CEILING;

  it('adapts per request when no override is set', () => {
    delete process.env.MISSY_REASONING_EFFORT;
    try {
      const low = resolveMissyModelSettings([userMessage('List the departments')]);
      const high = resolveMissyModelSettings([
        userMessage("Compare Jane's and Tom's salary and explain the discrepancy, then recommend an adjustment."),
      ]);
      expect(low.reasoning).toBe('low');
      expect(high.reasoning).toBe('high');
    } finally {
      if (originalOverride === undefined) delete process.env.MISSY_REASONING_EFFORT;
      else process.env.MISSY_REASONING_EFFORT = originalOverride;
    }
  });

  it('an explicit MISSY_REASONING_EFFORT override pins every request regardless of content', () => {
    process.env.MISSY_REASONING_EFFORT = 'xhigh';
    try {
      const simpleLookup = resolveMissyModelSettings([userMessage('List the departments')]);
      const complexAnalysis = resolveMissyModelSettings([
        userMessage("Compare Jane's and Tom's salary and explain the bank account discrepancy."),
      ]);
      expect(simpleLookup.reasoning).toBe('xhigh');
      expect(complexAnalysis.reasoning).toBe('xhigh');
    } finally {
      if (originalOverride === undefined) delete process.env.MISSY_REASONING_EFFORT;
      else process.env.MISSY_REASONING_EFFORT = originalOverride;
    }
  });

  it('an invalid override is ignored in favour of the adaptive heuristic', () => {
    process.env.MISSY_REASONING_EFFORT = 'ultra-mega';
    try {
      const result = resolveMissyModelSettings([userMessage('List the departments')]);
      expect(result.reasoning).toBe('low');
    } finally {
      if (originalOverride === undefined) delete process.env.MISSY_REASONING_EFFORT;
      else process.env.MISSY_REASONING_EFFORT = originalOverride;
    }
  });

  it('a configured ceiling caps the adaptive heuristic without needing an override', () => {
    process.env.MISSY_REASONING_EFFORT_CEILING = 'medium';
    delete process.env.MISSY_REASONING_EFFORT;
    try {
      const result = resolveMissyModelSettings([
        userMessage("Compare Jane's and Tom's salary and explain the bank account discrepancy."),
      ]);
      expect(result.reasoning).toBe('medium');
    } finally {
      if (originalCeiling === undefined) delete process.env.MISSY_REASONING_EFFORT_CEILING;
      else process.env.MISSY_REASONING_EFFORT_CEILING = originalCeiling;
    }
  });
});
