import { describe, expect, it } from 'vitest';

import { resolveModuleScopes } from '@/lib/chat/tool-scope';

describe('resolveModuleScopes', () => {
  it('has no scope opinion for the app home screen (module null)', () => {
    expect(resolveModuleScopes(null)).toEqual([]);
  });

  it('the employees screen also offers org tools (department/position/location lookups)', () => {
    expect(resolveModuleScopes('employees')).toEqual(['employee', 'org']);
  });

  it('org, me and settings map to their own action-id prefixes', () => {
    expect(resolveModuleScopes('org')).toEqual(['org']);
    expect(resolveModuleScopes('me')).toEqual(['employee']);
    expect(resolveModuleScopes('settings')).toEqual(['identity', 'system']);
  });

  it('an unmapped module falls back to itself rather than offering nothing', () => {
    expect(resolveModuleScopes('payroll')).toEqual(['payroll']);
  });
});
