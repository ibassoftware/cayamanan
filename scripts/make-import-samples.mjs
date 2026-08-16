// Regenerates the employee-import sample files in docs/samples/.
//
//   node scripts/make-import-samples.mjs
//
// Writes real .xlsx (and CSV twins) without adding a dependency: `fflate` is already in
// the tree via `read-excel-file`, and an .xlsx is just a zip of a few XML parts. Writing
// them by hand also proves the reader the import path uses can parse what a writer emits.
//
// Cell values are written as inline strings (`t="inlineStr"`), which deliberately keeps
// dates as literal text — an import must cope with whatever a human typed, and coercing
// them here would hide exactly the case `employees-messy` exists to exercise.
import { zipSync, strToU8 } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'samples');

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columnName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
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

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function xlsx(rows) {
  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Employees" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(rows)),
  });
}

const csv = (rows) =>
  rows
    .map((row) =>
      row.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(','),
    )
    .join('\r\n');

/** Canonical headers, every row valid. Should import with no errors. */
const clean = [
  ['employeeNo', 'firstName', 'middleName', 'lastName', 'hireDate', 'sex', 'civilStatus', 'mobile', 'emailPersonal', 'biometricId'],
  ['EMP-2001', 'Jose', 'Protacio', 'Rizal', '2025-01-06', 'MALE', 'SINGLE', '09171112222', 'jose.rizal@example.com', 'BIO-2001'],
  ['EMP-2002', 'Andres', 'Bonifacio', 'de Castro', '2025-02-17', 'MALE', 'MARRIED', '09171113333', 'andres.b@example.com', 'BIO-2002'],
  ['EMP-2003', 'Gabriela', 'Cariño', 'Silang', '2025-03-03', 'FEMALE', 'MARRIED', '09171114444', 'gabriela.s@example.com', 'BIO-2003'],
  // Blank middle name and biometric id: proves the optional fields are genuinely optional.
  ['EMP-2004', 'Apolinario', '', 'Mabini', '2025-04-21', 'MALE', 'SINGLE', '09171115555', 'apolinario.m@example.com', ''],
  ['EMP-2005', 'Melchora', 'Aquino', 'de Ramos', '2025-05-12', 'FEMALE', 'WIDOWED', '09171116666', 'melchora.a@example.com', 'BIO-2005'],
];

/**
 * Non-canonical headers, so the mapping step has to earn its keep, plus one distinct
 * defect per row. Every row after the first is wrong in a different way on purpose —
 * a file that fails for one reason only tests one code path.
 */
const messy = [
  ['Emp No.', 'Given Name', 'Middle', 'Surname', 'Date Hired', 'Gender', 'Status', 'Contact No', 'E-mail', 'Biometrics ID'],
  ['EMP-3001', 'Juan', 'Santos', 'Dela Cruz', '2025-06-01', 'MALE', 'SINGLE', '09181112222', 'juan.dc@example.com', 'BIO-3001'],
  // Missing a required first name.
  ['EMP-3002', '', 'Reyes', 'Bautista', '2025-06-15', 'FEMALE', 'SINGLE', '09181113333', 'r.bautista@example.com', 'BIO-3002'],
  // Date in dd/mm/yyyy rather than ISO.
  ['EMP-3003', 'Pedro', 'Cruz', 'Penduko', '15/07/2025', 'MALE', 'SINGLE', '09181114444', 'pedro.p@example.com', 'BIO-3003'],
  // Employee number duplicated within the same file.
  ['EMP-3001', 'Duplicate', 'Of', 'Row Two', '2025-08-01', 'MALE', 'SINGLE', '09181115555', 'dupe@example.com', 'BIO-3005'],
  // Blank hire date, malformed email, and a biometric id colliding with row 2's — the
  // last should be refused by the partial unique index, not silently accepted.
  ['EMP-3005', 'Ligaya', 'Mendoza', 'Torres', '', 'FEMALE', 'MARRIED', '09181116666', 'not-an-email', 'BIO-3001'],
];

mkdirSync(OUT, { recursive: true });
for (const [name, rows] of [['employees-clean', clean], ['employees-messy', messy]]) {
  writeFileSync(join(OUT, `${name}.xlsx`), Buffer.from(xlsx(rows)));
  writeFileSync(join(OUT, `${name}.csv`), csv(rows), 'utf8');
}
console.log(`Wrote employees-clean and employees-messy (.xlsx + .csv) to ${OUT}`);
