import { describe, expect, it } from 'vitest';

import { formatEmployeeName, statusBadgeVariant, statusLabel } from '@/components/employee/employee-state';

// Pure UI-logic tests for the employee screens (list/detail/create/edit —
// 04-organization-employees.md).
describe('formatEmployeeName', () => {
  it('joins first, middle and last name', () => {
    expect(formatEmployeeName({ firstName: 'Maria', middleName: 'Reyes', lastName: 'Santos', suffix: null })).toBe(
      'Maria Reyes Santos',
    );
  });

  it('omits a null/blank middle name without a stray double space', () => {
    expect(formatEmployeeName({ firstName: 'Maria', middleName: null, lastName: 'Santos', suffix: null })).toBe(
      'Maria Santos',
    );
    expect(formatEmployeeName({ firstName: 'Maria', middleName: '  ', lastName: 'Santos', suffix: null })).toBe(
      'Maria Santos',
    );
  });

  it('appends a suffix when present', () => {
    expect(formatEmployeeName({ firstName: 'Juan', middleName: null, lastName: 'Dela Cruz', suffix: 'Jr.' })).toBe(
      'Juan Dela Cruz Jr.',
    );
  });
});

describe('statusBadgeVariant / statusLabel', () => {
  it('maps each known status to a badge variant and a readable label', () => {
    expect(statusBadgeVariant('ACTIVE')).toBe('success');
    expect(statusLabel('ACTIVE')).toBe('Active');
    expect(statusBadgeVariant('ON_LEAVE')).toBe('warning');
    expect(statusLabel('ON_LEAVE')).toBe('On leave');
    expect(statusBadgeVariant('SEPARATED')).toBe('secondary');
    expect(statusLabel('SEPARATED')).toBe('Separated');
  });

  it('falls back gracefully for an unrecognized status', () => {
    expect(statusBadgeVariant('WHATEVER')).toBe('secondary');
    expect(statusLabel('WHATEVER')).toBe('WHATEVER');
  });
});
