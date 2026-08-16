import { describe, expect, it } from 'vitest';

import { deriveMissyState } from '@/lib/chat/missy-state';
import { classifyActionIntent } from '@/lib/chat/tool-label';

/** An assistant message carrying a single tool part in the given state. */
function withTool(part: Record<string, unknown>) {
  return { role: 'assistant', parts: [part as { type: string }] };
}

const okResult = { status: 'ok', data: {} };
const forbidden = { status: 'error', code: 'FORBIDDEN', message: 'Not permitted.' };
const confirmation = {
  status: 'confirmation_required',
  confirmationId: 'c1',
  token: 't1',
  actionId: 'employee.updateSalary',
  title: 'Update salary',
  preview: {},
  expiresAt: '2026-08-16T10:00:00.000Z',
};

describe('classifyActionIntent', () => {
  it('reads list/get/search actions as reads', () => {
    expect(classifyActionIntent('org.listPositions')).toBe('read');
    expect(classifyActionIntent('employee.getSelf')).toBe('read');
    expect(classifyActionIntent('employee.searchByName')).toBe('read');
  });

  it('treats every other known verb as a write', () => {
    expect(classifyActionIntent('org.createDepartment')).toBe('write');
    expect(classifyActionIntent('employee.updateGovernmentIds')).toBe('write');
    expect(classifyActionIntent('identity.changeOwnPassword')).toBe('write');
    expect(classifyActionIntent('ui.navigate')).toBe('write');
  });

  it('classifies verbless reads by id', () => {
    expect(classifyActionIntent('identity.me')).toBe('read');
    expect(classifyActionIntent('system.ping')).toBe('read');
  });

  // The fallback contract humanizeToolName already uses: an id we do not recognise is
  // left neutral rather than guessed at, so a new action is unpolished, never mislabelled.
  it('returns unknown rather than guessing', () => {
    expect(classifyActionIntent('payroll.reconcile')).toBe('unknown');
    expect(classifyActionIntent('nodots')).toBe('unknown');
  });
});

describe('deriveMissyState', () => {
  it('is idle at rest', () => {
    expect(deriveMissyState('ready', undefined)).toBe('idle');
    expect(deriveMissyState('ready', withTool({ type: 'tool-org_listPositions', state: 'output-available', output: okResult }))).toBe('idle');
  });

  it('thinks once submitted, before any tool call', () => {
    expect(deriveMissyState('submitted', undefined)).toBe('thinking');
    expect(deriveMissyState('streaming', { role: 'assistant', parts: [{ type: 'reasoning' }] })).toBe('thinking');
  });

  it('reads while a lookup is in flight', () => {
    expect(deriveMissyState('streaming', withTool({ type: 'tool-org_listPositions', state: 'input-streaming' }))).toBe('reading');
  });

  it('works while a mutation is in flight', () => {
    expect(deriveMissyState('streaming', withTool({ type: 'tool-org_createDepartment', state: 'input-available' }))).toBe('working');
  });

  it('falls back to the neutral busy pose for an unclassified action', () => {
    expect(deriveMissyState('streaming', withTool({ type: 'tool-payroll_reconcile', state: 'input-streaming' }))).toBe('working');
  });

  it('recovers the action id from a dynamic tool part', () => {
    expect(deriveMissyState('streaming', withTool({ type: 'dynamic-tool', toolName: 'org_listPositions', state: 'input-streaming' }))).toBe('reading');
  });

  it('ignores Mastra’s working-memory bookkeeping when picking a pose', () => {
    expect(deriveMissyState('streaming', withTool({ type: 'tool-updateWorkingMemory', state: 'input-streaming' }))).toBe('thinking');
  });

  it('acts out the most recent outstanding call, not the first', () => {
    const message = {
      role: 'assistant',
      parts: [
        { type: 'tool-org_listPositions', state: 'output-available', output: okResult },
        { type: 'tool-org_createDepartment', state: 'input-streaming' },
      ],
    };
    expect(deriveMissyState('streaming', message)).toBe('working');
  });

  it('goes back to thinking once every call has returned but text is still streaming', () => {
    expect(deriveMissyState('streaming', withTool({ type: 'tool-org_listPositions', state: 'output-available', output: okResult }))).toBe('thinking');
  });

  describe('precedence', () => {
    // A pending approval is the one thing the user must act on, so it outranks everything
    // and — unlike every other state — survives the turn ending.
    it('awaits approval even after the turn is ready', () => {
      expect(deriveMissyState('ready', withTool({ type: 'tool-employee_updateSalary', state: 'output-available', output: confirmation }))).toBe('awaiting-approval');
    });

    it('awaits approval ahead of a failure elsewhere in the same turn', () => {
      const message = {
        role: 'assistant',
        parts: [
          { type: 'tool-org_listPositions', state: 'output-available', output: forbidden },
          { type: 'tool-employee_updateSalary', state: 'output-available', output: confirmation },
        ],
      };
      expect(deriveMissyState('ready', message)).toBe('awaiting-approval');
    });

    it('is concerned by a permission failure', () => {
      expect(deriveMissyState('streaming', withTool({ type: 'tool-identity_listUsers', state: 'output-available', output: forbidden }))).toBe('concerned');
    });

    it('is concerned by a transport-level tool error', () => {
      expect(deriveMissyState('streaming', withTool({ type: 'tool-org_listPositions', state: 'output-error' }))).toBe('concerned');
    });

    it('is concerned when the turn itself errors', () => {
      expect(deriveMissyState('error', undefined)).toBe('concerned');
    });

    it('lets a failure outrank work still in flight', () => {
      const message = {
        role: 'assistant',
        parts: [
          { type: 'tool-identity_listUsers', state: 'output-available', output: forbidden },
          { type: 'tool-org_listPositions', state: 'input-streaming' },
        ],
      };
      expect(deriveMissyState('streaming', message)).toBe('concerned');
    });
  });

  it('ignores a trailing user message', () => {
    expect(deriveMissyState('submitted', { role: 'user', parts: [{ type: 'text' }] })).toBe('thinking');
  });
});
