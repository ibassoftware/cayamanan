import { describe, expect, it } from 'vitest';

import { isImportField, mapColumns, mapRow, resolveConfirmedMapping } from '@/modules/employee/service/import-columns';

describe('mapColumns / mapRow', () => {
  it('matches header names case-insensitively, ignoring spaces and underscores', () => {
    const mapping = mapColumns(['Employee No', 'employee_no', 'employeeNo'].slice(0, 1));
    expect(mapping.fieldByIndex).toEqual(['employeeNo']);
  });

  it('treats "Employee No", "employee_no" and "employeeNo" as the same field across three files', () => {
    expect(mapColumns(['Employee No']).fieldByIndex).toEqual(['employeeNo']);
    expect(mapColumns(['employee_no']).fieldByIndex).toEqual(['employeeNo']);
    expect(mapColumns(['employeeNo']).fieldByIndex).toEqual(['employeeNo']);
  });

  it('reports unknown columns as warnings, not silent drops', () => {
    const mapping = mapColumns(['employeeNo', 'Favorite Color']);
    expect(mapping.unknownColumns).toEqual(['Favorite Color']);
    expect(mapping.fieldByIndex).toEqual(['employeeNo', null]);
  });

  it('names missing required columns', () => {
    const mapping = mapColumns(['firstName', 'lastName']);
    expect(mapping.missingRequiredColumns).toEqual(['employeeNo']);
  });

  it('rejects two columns that map to the same field as ambiguous', () => {
    const mapping = mapColumns(['employeeNo', 'Employee No']);
    expect(mapping.duplicateFieldColumns).toEqual([{ field: 'employeeNo', columns: ['employeeNo', 'Employee No'] }]);
  });

  it('mapRow omits unknown columns and empty cells, keeping known non-empty ones', () => {
    const mapping = mapColumns(['employeeNo', 'Favorite Color', 'firstName']);
    const record = mapRow(mapping.fieldByIndex, ['EMP-1', 'blue', '']);
    expect(record).toEqual({ employeeNo: 'EMP-1' });
  });

  it('matches biometricId the same way as any other field (case/space/underscore-insensitive)', () => {
    expect(mapColumns(['biometricId']).fieldByIndex).toEqual(['biometricId']);
    expect(mapColumns(['Biometric Id']).fieldByIndex).toEqual(['biometricId']);
    expect(mapColumns(['biometric_id']).fieldByIndex).toEqual(['biometricId']);
  });
});

describe('isImportField', () => {
  it('accepts every real field and rejects anything else', () => {
    expect(isImportField('biometricId')).toBe(true);
    expect(isImportField('employeeNo')).toBe(true);
    expect(isImportField('salary')).toBe(false);
    expect(isImportField('bankAccountNumber')).toBe(false);
    expect(isImportField('')).toBe(false);
  });
});

describe('resolveConfirmedMapping', () => {
  const header = ['Emp No.', 'Given Name', 'Biometrics ID'];

  it('resolves a confirmed mapping matching the header into a fieldByIndex', () => {
    const result = resolveConfirmedMapping(header, [
      { column: 'Emp No.', field: 'employeeNo' },
      { column: 'Given Name', field: 'firstName' },
      { column: 'Biometrics ID', field: 'biometricId' },
    ]);
    expect(result).toEqual({ ok: true, data: { fieldByIndex: ['employeeNo', 'firstName', 'biometricId'] } });
  });

  it('allows a column to be left unmapped with field: null', () => {
    const result = resolveConfirmedMapping(header, [
      { column: 'Emp No.', field: 'employeeNo' },
      { column: 'Given Name', field: null },
      { column: 'Biometrics ID', field: null },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.fieldByIndex).toEqual(['employeeNo', null, null]);
  });

  it('rejects a mapping whose length does not match the header', () => {
    const result = resolveConfirmedMapping(header, [{ column: 'Emp No.', field: 'employeeNo' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a mapping whose column names do not match the freshly re-parsed header (a stale mapping from a different file)', () => {
    const result = resolveConfirmedMapping(header, [
      { column: 'Employee Number', field: 'employeeNo' },
      { column: 'Given Name', field: 'firstName' },
      { column: 'Biometrics ID', field: 'biometricId' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('mapping');
  });

  it('rejects an invented field name the client claims is real, never silently drops it', () => {
    const result = resolveConfirmedMapping(header, [
      { column: 'Emp No.', field: 'employeeNo' },
      { column: 'Given Name', field: 'salary' },
      { column: 'Biometrics ID', field: 'biometricId' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('salary');
    }
  });

  it('rejects two columns mapped to the same field as ambiguous', () => {
    const result = resolveConfirmedMapping(header, [
      { column: 'Emp No.', field: 'employeeNo' },
      { column: 'Given Name', field: 'employeeNo' },
      { column: 'Biometrics ID', field: 'biometricId' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Ambiguous');
  });

  it('rejects a mapping missing the required employeeNo column', () => {
    const result = resolveConfirmedMapping(header, [
      { column: 'Emp No.', field: null },
      { column: 'Given Name', field: 'firstName' },
      { column: 'Biometrics ID', field: 'biometricId' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('employeeNo');
  });
});
