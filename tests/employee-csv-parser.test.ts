import { describe, expect, it } from 'vitest';

import { parseCsv } from '@/modules/employee/service/csv';

// Pure unit tests, no DB — this is the part of the import feature most likely to
// silently corrupt someone's data if it's wrong, so every awkward RFC 4180 case gets its
// own assertion rather than one big fixture.
describe('parseCsv', () => {
  it('parses a plain comma-separated file', () => {
    const result = parseCsv('employeeNo,firstName,lastName\nEMP-1,Maria,Santos\nEMP-2,Juan,Cruz\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.header).toEqual(['employeeNo', 'firstName', 'lastName']);
    expect(result.data.rows).toEqual([
      ['EMP-1', 'Maria', 'Santos'],
      ['EMP-2', 'Juan', 'Cruz'],
    ]);
  });

  it('handles a quoted field containing an embedded comma', () => {
    const result = parseCsv('employeeNo,address\nEMP-1,"123 Rizal St, Brgy 4"\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([['EMP-1', '123 Rizal St, Brgy 4']]);
  });

  it('handles a quoted field containing an embedded newline', () => {
    const result = parseCsv('employeeNo,notes\nEMP-1,"line one\nline two"\nEMP-2,plain\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([
      ['EMP-1', 'line one\nline two'],
      ['EMP-2', 'plain'],
    ]);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    const result = parseCsv('employeeNo,lastName\nEMP-1,"O""Brien"\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([['EMP-1', 'O"Brien']]);
  });

  it('accepts CRLF line endings', () => {
    const result = parseCsv('employeeNo,firstName\r\nEMP-1,Maria\r\nEMP-2,Juan\r\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.header).toEqual(['employeeNo', 'firstName']);
    expect(result.data.rows).toEqual([
      ['EMP-1', 'Maria'],
      ['EMP-2', 'Juan'],
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    const result = parseCsv('﻿employeeNo,firstName\nEMP-1,Maria\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.header).toEqual(['employeeNo', 'firstName']);
  });

  it('ignores trailing blank lines', () => {
    const result = parseCsv('employeeNo,firstName\nEMP-1,Maria\n\n\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([['EMP-1', 'Maria']]);
  });

  it('preserves a row of deliberately empty values (not a blank line)', () => {
    const result = parseCsv('employeeNo,firstName,lastName\nEMP-1,,\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([['EMP-1', '', '']]);
  });

  it('sniffs a tab-separated paste (a header with tabs and no commas)', () => {
    const result = parseCsv('employeeNo\tfirstName\tlastName\nEMP-1\tMaria\tSantos\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.header).toEqual(['employeeNo', 'firstName', 'lastName']);
    expect(result.data.rows).toEqual([['EMP-1', 'Maria', 'Santos']]);
  });

  it('rejects a ragged row with a different column count than the header, naming the row number', () => {
    const result = parseCsv('employeeNo,firstName,lastName\nEMP-1,Maria,Santos\nEMP-2,Juan\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toContain('Row 3');
  });

  it('rejects an unterminated quoted field', () => {
    const result = parseCsv('employeeNo,notes\nEMP-1,"unterminated\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an empty file', () => {
    const result = parseCsv('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a file that is only whitespace', () => {
    const result = parseCsv('   \n  \n');
    expect(result.ok).toBe(false);
  });
});
