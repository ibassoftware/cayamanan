import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

import {
  MAX_COMPRESSION_RATIO,
  MAX_UNCOMPRESSED_BYTES,
  checkZipExpansion,
} from '@/modules/employee/service/zip-expansion';
import { parseXlsxWorkbook } from '@/modules/employee/service/spreadsheet';

// An .xlsx is a zip, so the 5 MB cap on the upload only bounds the *compressed* size, and
// the 1000-row cap downstream runs only after the parser has already unzipped everything
// into memory. This file exists to prove the gap is actually closed — with a real bomb,
// not an assertion that one would be caught.
function sheetOfRepeatedCells(cellCount: number): string {
  const cell = '<c r="A1" t="inlineStr"><is><t>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA</t></is></c>';
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData><row r="1">${cell.repeat(cellCount)}</row></sheetData></worksheet>`;
}

function zipWith(sheetXml: string): Buffer {
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    }),
  );
}

describe('checkZipExpansion', () => {
  it('accepts an ordinary workbook', () => {
    const result = checkZipExpansion(zipWith(sheetOfRepeatedCells(20)));
    expect(result.ok).toBe(true);
  });

  // The real thing: enormously repetitive XML that zips down to almost nothing. Without
  // the guard this reaches `read-excel-file` and is fully expanded in the shared process.
  it('refuses a highly compressible bomb before anything is decompressed', () => {
    const bomb = zipWith(sheetOfRepeatedCells(400_000));
    const declared = checkZipExpansion(bomb);

    // Sanity-check that the fixture really is a bomb: small on disk, huge expanded.
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(declared.ok).toBe(false);
    if (!declared.ok) expect(declared.reason).toMatch(/expands|compressed far more/i);
  });

  it('reports the ratio it measured for a benign file', () => {
    const result = checkZipExpansion(zipWith(sheetOfRepeatedCells(20)));
    if (result.ok) {
      expect(result.uncompressedBytes).toBeGreaterThan(0);
      expect(result.ratio).toBeLessThan(MAX_COMPRESSION_RATIO);
    }
  });

  // A guard that throws on non-zip input would turn "this isn't a spreadsheet" into a
  // confusing internal error. It defers to the parser, which has a better message.
  it('stays out of the way of input that is not a zip at all', () => {
    expect(checkZipExpansion(Buffer.from('just some text, definitely not a zip')).ok).toBe(true);
    expect(checkZipExpansion(Buffer.alloc(0)).ok).toBe(true);
  });

  it('keeps the caps in a sane relationship to the 5 MB upload limit', () => {
    expect(MAX_UNCOMPRESSED_BYTES).toBeGreaterThan(5 * 1024 * 1024);
  });
});

describe('parseXlsxWorkbook bomb handling', () => {
  it('rejects the bomb with a readable message instead of expanding it', async () => {
    const result = await parseXlsxWorkbook(zipWith(sheetOfRepeatedCells(400_000)));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toMatch(/expands|compressed far more/i);
    }
  });
});
