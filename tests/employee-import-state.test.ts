import { describe, expect, it } from 'vitest';

import { IMPORT_FIELDS } from '@/modules/employee/service/import-columns';
import { MAX_CSV_INPUT_LENGTH } from '@/modules/employee/service/csv';
import { MAX_XLSX_BYTES as BACKEND_MAX_XLSX_BYTES } from '@/modules/employee/service/spreadsheet';
import {
  IMPORT_TEMPLATE_COLUMNS,
  MAX_CSV_CHARS,
  MAX_XLSX_BYTES,
  REQUIRED_IMPORT_FIELDS,
  applyAiSuggestions,
  buildTemplateCsv,
  canCommitImport,
  canProceedFromMapping,
  checkCsvSize,
  checkXlsxSize,
  collectValueColumns,
  columnLabel,
  duplicateMappedFields,
  formatCellValue,
  formatSpreadsheetCell,
  initialMappingFromHeader,
  isImportTemplateField,
  missingRequiredFields,
  normalizeSpreadsheetRow,
  operationBadgeVariant,
  operationLabel,
  parseCsvPreview,
  summaryText,
  wizardStepLabel,
  wizardSteps,
  type MappingRow,
} from '@/components/employee/import-state';

// Pure UI-logic tests for the CSV employee import screen.
describe('IMPORT_TEMPLATE_COLUMNS / MAX_CSV_CHARS — drift guard', () => {
  it('mirrors the backend\'s recognized column list exactly', () => {
    expect(IMPORT_TEMPLATE_COLUMNS).toEqual(IMPORT_FIELDS);
  });

  it('mirrors the backend\'s max CSV input length', () => {
    expect(MAX_CSV_CHARS).toBe(MAX_CSV_INPUT_LENGTH);
  });

  it('mirrors the backend\'s max xlsx byte size', () => {
    expect(MAX_XLSX_BYTES).toBe(BACKEND_MAX_XLSX_BYTES);
  });
});

describe('checkCsvSize', () => {
  it('passes at or under the cap', () => {
    expect(checkCsvSize(MAX_CSV_CHARS)).toEqual({ ok: true });
    expect(checkCsvSize(100)).toEqual({ ok: true });
  });

  it('fails over the cap with a friendly, unit-aware message', () => {
    const result = checkCsvSize(MAX_CSV_CHARS + 1, 'bytes');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('bytes');
    expect(result.message).toContain(MAX_CSV_CHARS.toLocaleString());
  });

  it('defaults to describing characters', () => {
    const result = checkCsvSize(MAX_CSV_CHARS + 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('characters');
  });
});

describe('buildTemplateCsv', () => {
  it('produces a single header row of every recognized column', () => {
    const csv = buildTemplateCsv();
    expect(csv).toBe(`${IMPORT_TEMPLATE_COLUMNS.join(',')}\r\n`);
    expect(csv.split(',')).toHaveLength(IMPORT_TEMPLATE_COLUMNS.length);
  });
});

describe('operationLabel / operationBadgeVariant', () => {
  it('maps every operation to a readable label', () => {
    expect(operationLabel('CREATE')).toBe('Created');
    expect(operationLabel('UPDATE')).toBe('Updated');
    expect(operationLabel('ERROR')).toBe('Error');
  });

  it('maps every operation to a distinct badge variant', () => {
    expect(operationBadgeVariant('CREATE')).toBe('success');
    expect(operationBadgeVariant('UPDATE')).toBe('brand');
    expect(operationBadgeVariant('ERROR')).toBe('destructive');
  });
});

describe('summaryText', () => {
  it('renders counts with singular/plural "error(s)"', () => {
    expect(summaryText({ toCreate: 3, toUpdate: 2, withErrors: 1 })).toBe('3 to create · 2 to update · 1 with error');
    expect(summaryText({ toCreate: 0, toUpdate: 0, withErrors: 2 })).toBe('0 to create · 0 to update · 2 with errors');
  });
});

describe('canCommitImport', () => {
  it('is false with no preview yet', () => {
    expect(canCommitImport(null, false)).toBe(false);
  });

  it('is false while any row has an error, even with valid rows present', () => {
    expect(canCommitImport({ toCreate: 5, toUpdate: 0, withErrors: 1 }, false)).toBe(false);
  });

  it('is false while a commit is already in flight', () => {
    expect(canCommitImport({ toCreate: 1, toUpdate: 0, withErrors: 0 }, true)).toBe(false);
  });

  it('is false when there is nothing to create or update', () => {
    expect(canCommitImport({ toCreate: 0, toUpdate: 0, withErrors: 0 }, false)).toBe(false);
  });

  it('is true with at least one valid row, no errors, and no commit in flight', () => {
    expect(canCommitImport({ toCreate: 2, toUpdate: 1, withErrors: 0 }, false)).toBe(true);
  });
});

describe('formatCellValue', () => {
  it('renders the placeholder dash for null, undefined, and blank strings', () => {
    expect(formatCellValue(null)).toBe('—');
    expect(formatCellValue(undefined)).toBe('—');
    expect(formatCellValue('   ')).toBe('—');
  });

  it('renders a real value as a trimmed string', () => {
    expect(formatCellValue('  Maria  ')).toBe('Maria');
    expect(formatCellValue(2026)).toBe('2026');
  });
});

describe('collectValueColumns', () => {
  it('orders columns by the canonical field order, not appearance order', () => {
    const rows = [
      { values: { lastName: 'Santos', employeeNo: 'EMP-1' } },
      { values: { firstName: 'Maria', employeeNo: 'EMP-2' } },
    ];
    expect(collectValueColumns(rows)).toEqual(['employeeNo', 'firstName', 'lastName']);
  });

  it('appends an unrecognized key defensively rather than dropping it', () => {
    const rows = [{ values: { employeeNo: 'EMP-1', mysteryField: 'x' } }];
    expect(collectValueColumns(rows)).toEqual(['employeeNo', 'mysteryField']);
  });

  it('returns an empty array for no rows', () => {
    expect(collectValueColumns([])).toEqual([]);
  });
});

describe('columnLabel', () => {
  it('humanizes a camelCase field name', () => {
    expect(columnLabel('employeeNo')).toBe('Employee no');
    expect(columnLabel('emailPersonal')).toBe('Email personal');
    expect(columnLabel('birthDate')).toBe('Birth date');
  });
});

describe('checkXlsxSize', () => {
  it('passes at or under the 5 MB cap', () => {
    expect(checkXlsxSize(MAX_XLSX_BYTES)).toEqual({ ok: true });
    expect(checkXlsxSize(1024)).toEqual({ ok: true });
  });

  it('fails over the cap with an MB-aware message', () => {
    const result = checkXlsxSize(MAX_XLSX_BYTES + 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('MB');
  });
});

describe('isImportTemplateField', () => {
  it('accepts every recognized column, including the newest one', () => {
    for (const field of IMPORT_TEMPLATE_COLUMNS) {
      expect(isImportTemplateField(field)).toBe(true);
    }
    expect(isImportTemplateField('biometricId')).toBe(true);
  });

  it('rejects an unrecognized string', () => {
    expect(isImportTemplateField('notARealField')).toBe(false);
  });
});

describe('wizardSteps / wizardStepLabel', () => {
  it('includes a sheet-picking step only for a multi-sheet workbook', () => {
    expect(wizardSteps(false)).toEqual(['file', 'mapping', 'preview']);
    expect(wizardSteps(true)).toEqual(['file', 'sheet', 'mapping', 'preview']);
  });

  it('labels every step', () => {
    expect(wizardStepLabel('file')).toBe('Choose file');
    expect(wizardStepLabel('sheet')).toBe('Pick sheet');
    expect(wizardStepLabel('mapping')).toBe('Map columns');
    expect(wizardStepLabel('preview')).toBe('Preview & confirm');
  });
});

describe('initialMappingFromHeader', () => {
  it('matches header names case/space/underscore-insensitively', () => {
    const result = initialMappingFromHeader(['Employee No', 'first_name', 'LASTNAME']);
    expect(result).toEqual([
      { column: 'Employee No', field: 'employeeNo', confidence: null },
      { column: 'first_name', field: 'firstName', confidence: null },
      { column: 'LASTNAME', field: 'lastName', confidence: null },
    ]);
  });

  it('leaves an unrecognized column unmapped', () => {
    expect(initialMappingFromHeader(['Favorite Color'])).toEqual([
      { column: 'Favorite Color', field: null, confidence: null },
    ]);
  });

  it('only maps the first column on a collision, leaving the rest unmapped', () => {
    const result = initialMappingFromHeader(['employeeNo', 'Employee No']);
    expect(result).toEqual([
      { column: 'employeeNo', field: 'employeeNo', confidence: null },
      { column: 'Employee No', field: null, confidence: null },
    ]);
  });
});

describe('applyAiSuggestions', () => {
  const baseMapping: MappingRow[] = [
    { column: 'Employee No', field: 'employeeNo', confidence: null },
    { column: 'Given Name', field: null, confidence: null },
    { column: 'Surname', field: null, confidence: null },
  ];

  it('fills gaps only, never overwriting an already-mapped column', () => {
    const result = applyAiSuggestions(baseMapping, [
      { column: 'Employee No', field: 'firstName', confidence: 'high' },
      { column: 'Given Name', field: 'firstName', confidence: 'high' },
      { column: 'Surname', field: 'lastName', confidence: 'low' },
    ]);
    expect(result).toEqual([
      { column: 'Employee No', field: 'employeeNo', confidence: null },
      { column: 'Given Name', field: 'firstName', confidence: 'high' },
      { column: 'Surname', field: 'lastName', confidence: 'low' },
    ]);
  });

  it('drops a suggestion whose field is already claimed by another row', () => {
    const mapping: MappingRow[] = [
      { column: 'Employee No', field: 'employeeNo', confidence: null },
      { column: 'ID Number', field: null, confidence: null },
    ];
    const result = applyAiSuggestions(mapping, [
      { column: 'Employee No', field: 'employeeNo', confidence: 'high' },
      { column: 'ID Number', field: 'employeeNo', confidence: 'low' },
    ]);
    expect(result[1]).toEqual({ column: 'ID Number', field: null, confidence: null });
  });

  it('ignores a null suggestion', () => {
    const result = applyAiSuggestions(baseMapping, [
      { column: 'Employee No', field: 'employeeNo', confidence: 'high' },
      { column: 'Given Name', field: null, confidence: 'low' },
      { column: 'Surname', field: null, confidence: 'low' },
    ]);
    expect(result[1].field).toBeNull();
  });
});

describe('missingRequiredFields / duplicateMappedFields / canProceedFromMapping', () => {
  it('reports employeeNo missing when no column maps to it', () => {
    const mapping: MappingRow[] = [{ column: 'First Name', field: 'firstName', confidence: null }];
    expect(missingRequiredFields(mapping)).toEqual(REQUIRED_IMPORT_FIELDS);
    expect(canProceedFromMapping(mapping)).toBe(false);
  });

  it('reports no missing fields once employeeNo is mapped', () => {
    const mapping: MappingRow[] = [{ column: 'Employee No', field: 'employeeNo', confidence: null }];
    expect(missingRequiredFields(mapping)).toEqual([]);
  });

  it('flags a field claimed by more than one column', () => {
    const mapping: MappingRow[] = [
      { column: 'Employee No', field: 'employeeNo', confidence: null },
      { column: 'ID', field: 'employeeNo', confidence: null },
    ];
    expect(duplicateMappedFields(mapping)).toEqual(['employeeNo']);
    expect(canProceedFromMapping(mapping)).toBe(false);
  });

  it('is true once required fields are mapped and nothing is duplicated', () => {
    const mapping: MappingRow[] = [
      { column: 'Employee No', field: 'employeeNo', confidence: null },
      { column: 'First Name', field: 'firstName', confidence: null },
    ];
    expect(canProceedFromMapping(mapping)).toBe(true);
  });
});

describe('parseCsvPreview', () => {
  it('splits a comma-delimited header and up to 3 sample rows', () => {
    const csv = 'employeeNo,firstName,lastName\nEMP-1,Maria,Santos\nEMP-2,Juan,Cruz\nEMP-3,Ana,Reyes\nEMP-4,Jose,Dela Cruz';
    const result = parseCsvPreview(csv);
    expect(result.header).toEqual(['employeeNo', 'firstName', 'lastName']);
    expect(result.sampleRows).toEqual([
      ['EMP-1', 'Maria', 'Santos'],
      ['EMP-2', 'Juan', 'Cruz'],
      ['EMP-3', 'Ana', 'Reyes'],
    ]);
  });

  it('sniffs a tab-delimited paste (more tabs than commas in the header)', () => {
    const tsv = 'employeeNo\tfirstName\tlastName\nEMP-1\tMaria\tSantos';
    expect(parseCsvPreview(tsv)).toEqual({
      header: ['employeeNo', 'firstName', 'lastName'],
      sampleRows: [['EMP-1', 'Maria', 'Santos']],
    });
  });

  it('honors a quoted field containing the delimiter', () => {
    const csv = 'employeeNo,notes\nEMP-1,"Santos, Maria"';
    expect(parseCsvPreview(csv)).toEqual({
      header: ['employeeNo', 'notes'],
      sampleRows: [['EMP-1', 'Santos, Maria']],
    });
  });

  it('strips a leading BOM', () => {
    const csv = '﻿employeeNo,firstName\nEMP-1,Maria';
    expect(parseCsvPreview(csv).header).toEqual(['employeeNo', 'firstName']);
  });

  it('returns empty header/rows for empty text', () => {
    expect(parseCsvPreview('')).toEqual({ header: [], sampleRows: [] });
  });
});

describe('formatSpreadsheetCell', () => {
  it('renders null as an empty string', () => {
    expect(formatSpreadsheetCell(null)).toBe('');
  });

  it('renders a Date cell as its UTC calendar date', () => {
    expect(formatSpreadsheetCell(new Date(Date.UTC(2026, 0, 15)))).toBe('2026-01-15');
  });

  it('renders a number/boolean cell as its plain string form', () => {
    expect(formatSpreadsheetCell(42)).toBe('42');
    expect(formatSpreadsheetCell(true)).toBe('true');
  });
});

describe('normalizeSpreadsheetRow', () => {
  it('pads a short row with empty cells', () => {
    expect(normalizeSpreadsheetRow(['a'], 3)).toEqual(['a', '', '']);
  });

  it('truncates a long row', () => {
    expect(normalizeSpreadsheetRow(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  it('leaves an exact-length row unchanged', () => {
    expect(normalizeSpreadsheetRow(['a', 'b'], 2)).toEqual(['a', 'b']);
  });
});
