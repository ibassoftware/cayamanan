import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

import { normalizeSheetRows, parseXlsxWorkbook, pickXlsxSheet } from '@/modules/employee/service/spreadsheet';

// Minimal, hand-built .xlsx workbook generator — the same technique
// scripts/make-import-samples.mjs already uses (an .xlsx is just a zip of a few XML
// parts), extended here to support more than one sheet so multi-sheet listing has a real
// fixture to exercise. Cell values are written as inline strings, same as that script,
// which is why a literal "15/07/2025" round-trips as a plain string rather than being
// interpreted as a date.
const esc = (value: unknown) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows: string[][]): string {
  const body = rows
    .map((cells, rowIndex) => {
      const encoded = cells
        .map((value, colIndex) =>
          value === '' || value == null
            ? ''
            : `<c r="${columnName(colIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`,
        )
        .join('');
      return `<row r="${rowIndex + 1}">${encoded}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** Builds a workbook with one worksheet part per entry in `sheets`. */
function buildXlsx(sheets: { name: string; rows: string[][] }[]): Buffer {
  const sheetEntries = sheets
    .map(({ name }, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const workbookRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('');
  const contentTypeOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentTypeOverrides}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`,
    ),
  };
  sheets.forEach(({ rows }, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(rows));
  });

  return Buffer.from(zipSync(files));
}

describe('normalizeSheetRows (pure)', () => {
  it('coerces every cell type to a string, including a Date as a calendar date', () => {
    // `read-excel-file`'s own .d.ts types a date cell as `typeof Date` (the constructor)
    // rather than `Date` (an instance) — a declaration bug, since the real runtime value
    // (and what `cellToString` actually checks with `instanceof Date`) is always an
    // instance. The cast below bridges that declared-vs-real mismatch for this one
    // hand-built fixture; production code never needs it, since data flowing out of
    // `readXlsxFile` already carries the (mis-declared) `Row` type consistently.
    const table = normalizeSheetRows([
      ['employeeNo', 'hireDate', 'count', 'active'],
      ['EMP-1', new Date(Date.UTC(2025, 6, 15)), 3, true],
    ] as unknown as Parameters<typeof normalizeSheetRows>[0]);
    expect('header' in table).toBe(true);
    if (!('header' in table)) return;
    expect(table.header).toEqual(['employeeNo', 'hireDate', 'count', 'active']);
    expect(table.rows).toEqual([['EMP-1', '2025-07-15', '3', 'true']]);
  });

  it('never repairs a malformed date typed as plain text', () => {
    const table = normalizeSheetRows([
      ['employeeNo', 'hireDate'],
      ['EMP-1', '15/07/2025'],
    ]);
    if (!('header' in table)) throw new Error('expected a table');
    expect(table.rows).toEqual([['EMP-1', '15/07/2025']]);
  });

  it('pads a row shorter than the header with empty cells (sparse trailing cells), rather than rejecting it', () => {
    const table = normalizeSheetRows([
      ['employeeNo', 'firstName', 'lastName'],
      ['EMP-1', 'Maria'],
    ]);
    if (!('header' in table)) throw new Error('expected a table');
    expect(table.rows).toEqual([['EMP-1', 'Maria', '']]);
  });

  it('rejects a row with more cells than the header', () => {
    const table = normalizeSheetRows([
      ['employeeNo', 'firstName'],
      ['EMP-1', 'Maria', 'Santos'],
    ]);
    expect('error' in table).toBe(true);
    if (!('error' in table)) return;
    expect(table.error).toContain('Row 2');
  });

  it('treats null cells as empty strings', () => {
    const table = normalizeSheetRows([
      ['employeeNo', 'middleName'],
      ['EMP-1', null],
    ]);
    if (!('header' in table)) throw new Error('expected a table');
    expect(table.rows).toEqual([['EMP-1', '']]);
  });

  it('returns an empty table for a sheet with no rows at all', () => {
    const table = normalizeSheetRows([]);
    if (!('header' in table)) throw new Error('expected a table');
    expect(table).toEqual({ header: [], rows: [] });
  });
});

describe('parseXlsxWorkbook / pickXlsxSheet (real .xlsx bytes)', () => {
  it('lists every sheet name and normalizes each one, for a multi-sheet workbook', async () => {
    const buffer = buildXlsx([
      {
        name: 'Employees',
        rows: [
          ['employeeNo', 'firstName', 'lastName'],
          ['EMP-1', 'Maria', 'Santos'],
        ],
      },
      {
        name: 'Notes',
        rows: [['note'], ['not employee data']],
      },
    ]);

    const workbook = await parseXlsxWorkbook(buffer);
    expect(workbook.ok).toBe(true);
    if (!workbook.ok) return;
    expect(workbook.data.sheets.map((s) => s.name)).toEqual(['Employees', 'Notes']);

    const employeesSheet = pickXlsxSheet(workbook.data.sheets, 'Employees');
    expect(employeesSheet.ok).toBe(true);
    if (employeesSheet.ok) {
      expect(employeesSheet.data.header).toEqual(['employeeNo', 'firstName', 'lastName']);
      expect(employeesSheet.data.rows).toEqual([['EMP-1', 'Maria', 'Santos']]);
    }

    // No sheet name given: defaults to the first sheet in the workbook, never assumed to
    // be "the" sheet without a name being an option to override it.
    const defaultSheet = pickXlsxSheet(workbook.data.sheets);
    expect(defaultSheet.ok).toBe(true);
    if (defaultSheet.ok) expect(defaultSheet.data.header).toEqual(['employeeNo', 'firstName', 'lastName']);
  });

  it('errors when the requested sheet name does not exist', async () => {
    const buffer = buildXlsx([{ name: 'Employees', rows: [['employeeNo'], ['EMP-1']] }]);
    const workbook = await parseXlsxWorkbook(buffer);
    expect(workbook.ok).toBe(true);
    if (!workbook.ok) return;

    const missing = pickXlsxSheet(workbook.data.sheets, 'DoesNotExist');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.field).toBe('sheet');
  });

  it('rejects an empty buffer and an oversized one', async () => {
    const empty = await parseXlsxWorkbook(Buffer.alloc(0));
    expect(empty.ok).toBe(false);

    const oversized = await parseXlsxWorkbook(Buffer.alloc(6 * 1024 * 1024));
    expect(oversized.ok).toBe(false);
  });

  it('reads the real docs/samples/employees-clean.xlsx fixture and matches its .csv twin', async () => {
    const buffer = readFileSync(join(process.cwd(), 'docs/samples/employees-clean.xlsx'));
    const workbook = await parseXlsxWorkbook(buffer);
    expect(workbook.ok).toBe(true);
    if (!workbook.ok) return;

    const sheet = pickXlsxSheet(workbook.data.sheets);
    expect(sheet.ok).toBe(true);
    if (!sheet.ok) return;
    expect(sheet.data.header).toEqual([
      'employeeNo',
      'firstName',
      'middleName',
      'lastName',
      'hireDate',
      'sex',
      'civilStatus',
      'mobile',
      'emailPersonal',
      'biometricId',
    ]);
    expect(sheet.data.rows).toHaveLength(5);
    expect(sheet.data.rows[0]).toEqual([
      'EMP-2001',
      'Jose',
      'Protacio',
      'Rizal',
      '2025-01-06',
      'MALE',
      'SINGLE',
      '09171112222',
      'jose.rizal@example.com',
      'BIO-2001',
    ]);
  });
});
