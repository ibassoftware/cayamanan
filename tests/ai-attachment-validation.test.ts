import { describe, expect, it } from 'vitest';

import { ActionError } from '@/platform/errors';
import { MAX_CSV_INPUT_LENGTH } from '@/modules/employee/service/csv';
import { MAX_ATTACHMENT_BASE64_LENGTH, validateAttachmentUpload } from '@/modules/ai/service/attachments';
import { createAttachmentAction } from '@/modules/ai/actions/create-attachment';

function base64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

describe('validateAttachmentUpload', () => {
  it('accepts a .csv file and reports the real row count from the deterministic parser', () => {
    const result = validateAttachmentUpload({
      filename: 'employees.csv',
      contentBase64: base64('name,age\nAlice,30\nBob,40\nCarol,50\n'),
    });
    expect(result.mimeType).toBe('text/csv');
    expect(result.rowCount).toBe(3);
    expect(result.byteSize).toBeGreaterThan(0);
  });

  it('accepts .tsv and .txt extensions, deriving mimeType from the extension only', () => {
    expect(validateAttachmentUpload({ filename: 'a.tsv', contentBase64: base64('a\tb\n1\t2\n') }).mimeType).toBe(
      'text/tab-separated-values',
    );
    expect(validateAttachmentUpload({ filename: 'a.txt', contentBase64: base64('a,b\n1,2\n') }).mimeType).toBe(
      'text/plain',
    );
  });

  it('rejects an unsupported extension', () => {
    expect(() =>
      validateAttachmentUpload({ filename: 'employees.xlsx', contentBase64: base64('a,b\n1,2\n') }),
    ).toThrow(ActionError);
  });

  it('rejects an empty file', () => {
    expect(() => validateAttachmentUpload({ filename: 'empty.csv', contentBase64: '' })).toThrow(ActionError);
  });

  it('rejects a binary payload that is not valid UTF-8 text', () => {
    // 0xFF 0xFE is not a valid UTF-8 sequence at all (unlike a stray high bit that some
    // lenient decoders repair) — TextDecoder's `fatal: true` must reject it outright.
    const binary = Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x01]).toString('base64');
    expect(() => validateAttachmentUpload({ filename: 'binary.csv', contentBase64: binary })).toThrow(ActionError);
  });

  it('rejects content beyond MAX_CSV_INPUT_LENGTH (the same bound the CSV parser itself enforces)', () => {
    const huge = 'a,b\n' + '1,2\n'.repeat(Math.ceil(MAX_CSV_INPUT_LENGTH / 4) + 10);
    expect(huge.length).toBeGreaterThan(MAX_CSV_INPUT_LENGTH);
    expect(() => validateAttachmentUpload({ filename: 'huge.csv', contentBase64: base64(huge) })).toThrow(ActionError);
  });
});

// The decoded-size cap in validateAttachmentUpload (via parseCsv's own MAX_CSV_INPUT_LENGTH
// check) is not, by itself, a real limit: it only runs after the whole payload has already
// been read and decoded into a second buffer/string. The schema bound on the action's own
// input is what actually protects the process — asserted here at the boundary, before
// anything decodes, mirroring tests/employee-document-validation.test.ts's "base64 length
// bound" suite for MAX_DOCUMENT_BASE64_LENGTH.
describe('MAX_ATTACHMENT_BASE64_LENGTH — encoded-string boundary', () => {
  it('is enforced by the action schema before anything decodes', () => {
    const oversized = 'A'.repeat(MAX_ATTACHMENT_BASE64_LENGTH + 1);
    const parsed = createAttachmentAction.input.safeParse({ filename: 'huge.csv', contentBase64: oversized });
    expect(parsed.success).toBe(false);
  });

  it('accepts a payload right at the boundary', () => {
    const atBoundary = 'A'.repeat(MAX_ATTACHMENT_BASE64_LENGTH);
    const parsed = createAttachmentAction.input.safeParse({ filename: 'ok.csv', contentBase64: atBoundary });
    expect(parsed.success).toBe(true);
  });
});
