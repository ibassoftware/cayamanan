import { describe, expect, it } from 'vitest';

import { deriveCodeFromName, departmentToOption, locationToOption, positionToOption } from '@/components/org/org-state';

// Pure UI-logic tests for the org reference-data screens (Departments/Positions/
// Locations/Cost Centers — 04-organization-employees.md).
describe('deriveCodeFromName', () => {
  it('uppercases and collapses non-alphanumerics into a single underscore', () => {
    expect(deriveCodeFromName('Finance & Accounting')).toBe('FINANCE_ACCOUNTING');
  });

  it('trims leading/trailing underscores left over from punctuation', () => {
    expect(deriveCodeFromName('  R&D!! ')).toBe('R_D');
  });

  it('falls back to a placeholder for a name with no alphanumerics', () => {
    expect(deriveCodeFromName('   ')).toBe('NEW');
    expect(deriveCodeFromName('***')).toBe('NEW');
  });

  it('truncates very long names to a sane length', () => {
    const code = deriveCodeFromName('a'.repeat(50));
    expect(code.length).toBe(24);
  });
});

describe('departmentToOption / positionToOption / locationToOption', () => {
  it('maps to a RelationOption with the code as the description', () => {
    expect(departmentToOption({ id: '1', code: 'FIN', name: 'Finance', parentId: null, depth: 0, isActive: true })).toEqual({
      id: '1',
      label: 'Finance',
      description: 'FIN',
    });
    expect(positionToOption({ id: '2', code: 'SWE', title: 'Software Engineer', isActive: true })).toEqual({
      id: '2',
      label: 'Software Engineer',
      description: 'SWE',
    });
    expect(
      locationToOption({ id: '3', code: 'MNL-HQ', name: 'Manila HQ', address: null, timezone: 'Asia/Manila', isActive: true }),
    ).toEqual({ id: '3', label: 'Manila HQ', description: 'MNL-HQ' });
  });
});
