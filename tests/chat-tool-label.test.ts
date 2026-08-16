import { describe, expect, it } from 'vitest';

import { humanizeToolName } from '@/lib/chat/tool-label';

describe('humanizeToolName', () => {
  it('reads as plain language for the actions HR staff actually trigger', () => {
    expect(humanizeToolName('org.listPositions')).toBe('Looked up positions');
    expect(humanizeToolName('org.createDepartment')).toBe('Created department');
    expect(humanizeToolName('org.archiveLocation')).toBe('Archived location');
    expect(humanizeToolName('employee.setStatus')).toBe('Updated status');
    expect(humanizeToolName('employee.linkUserAccount')).toBe('Linked user account');
  });

  it('keeps acronyms uppercase rather than lowercasing them', () => {
    expect(humanizeToolName('employee.updateGovernmentIds')).toBe('Updated government IDs');
  });

  it('uses the hand-written phrase where a generic derivation would read badly', () => {
    expect(humanizeToolName('identity.me')).toBe('Checked your account');
    expect(humanizeToolName('ui.navigate')).toBe('Opened a screen');
    expect(humanizeToolName('employee.getSelf')).toBe('Looked up your own record');
  });

  it('falls back to the raw id for an unknown verb rather than inventing a phrase', () => {
    // A new action should look unpolished, never mislabelled — a wrong verb in an audit
    // -adjacent surface is worse than a technical one.
    expect(humanizeToolName('payroll.recomputeEverything')).toBe('payroll.recomputeEverything');
    expect(humanizeToolName('malformed')).toBe('malformed');
  });
});
