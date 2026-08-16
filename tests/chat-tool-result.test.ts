import { describe, expect, it } from 'vitest';

import { normalizeToolName, parseToolResult, toApprovalInput } from '@/lib/chat/tool-result';

// Client-side mirror of src/mastra/tools/action-tool-bridge.ts's toolResultSchema —
// these tests pin the client's copy to the same three shapes the bridge actually returns.
describe('parseToolResult', () => {
  it('accepts an "ok" result', () => {
    const result = parseToolResult({ status: 'ok', data: { tenantId: 'x' } });
    expect(result).toEqual({ status: 'ok', data: { tenantId: 'x' } });
  });

  it('accepts a "confirmation_required" result', () => {
    const payload = {
      status: 'confirmation_required',
      confirmationId: 'c1',
      token: 't1',
      actionId: 'system.updateSetting',
      title: 'Update system setting',
      preview: { key: 'k', value: 'v', effectiveFrom: null },
      expiresAt: '2026-01-01T00:00:00.000Z',
    };
    expect(parseToolResult(payload)).toEqual(payload);
  });

  it('accepts an "error" result', () => {
    const payload = { status: 'error', code: 'FORBIDDEN', message: 'You do not have permission.' };
    expect(parseToolResult(payload)).toEqual(payload);
  });

  it('returns null for a malformed status, rather than throwing', () => {
    expect(parseToolResult({ status: 'something-else' })).toBeNull();
  });

  it('returns null for a non-object output', () => {
    expect(parseToolResult('just a string')).toBeNull();
    expect(parseToolResult(undefined)).toBeNull();
    expect(parseToolResult(null)).toBeNull();
  });
});

// Confirmed against a live /api/chat stream: OpenAI's function-name constraints turn
// registry action ids into underscored tool names (`ui.navigate` -> `ui_navigate`,
// `identity.me` -> `identity_me`) before they ever reach the UI message parts.
describe('normalizeToolName', () => {
  it('recovers the dotted registry id from the model-facing name', () => {
    expect(normalizeToolName('ui_navigate')).toBe('ui.navigate');
    expect(normalizeToolName('identity_me')).toBe('identity.me');
    expect(normalizeToolName('system_updateSetting')).toBe('system.updateSetting');
  });

  it('only replaces the first underscore', () => {
    expect(normalizeToolName('identity_listUsers')).toBe('identity.listUsers');
  });

  it('leaves an already-dotted name untouched', () => {
    expect(normalizeToolName('ui.navigate')).toBe('ui.navigate');
  });
});

// The confirmation card must resubmit the tool call's actual arguments on Approve, never
// the (possibly redacted/reshaped) `preview` — see confirmation-card.tsx's header comment
// and tests/missy-confirmation-redacted-preview.test.ts for the server-side proof this
// protects against.
describe('toApprovalInput', () => {
  it('passes through a plain object input unchanged', () => {
    expect(toApprovalInput({ key: 'payroll.bankDetails', value: { bankAccountNumber: '1234567890' } })).toEqual({
      key: 'payroll.bankDetails',
      value: { bankAccountNumber: '1234567890' },
    });
  });

  it('falls back to an empty object for a non-object input, rather than throwing', () => {
    expect(toApprovalInput('not an object')).toEqual({});
    expect(toApprovalInput(undefined)).toEqual({});
    expect(toApprovalInput(null)).toEqual({});
    expect(toApprovalInput(['array', 'not', 'a', 'record'])).toEqual({});
  });
});
