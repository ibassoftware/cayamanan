import { describe, expect, it } from 'vitest';

import { ActionError } from '@/platform/errors';
import {
  MAX_DOCUMENT_BASE64_LENGTH,
  MAX_DOCUMENT_BYTES,
  sanitizeFilename,
  validateDocumentUpload,
} from '@/modules/employee/service/document-validation';
import { uploadDocumentAction } from '@/modules/employee/actions/upload-document';

function jpegBytes(size = 32): Buffer {
  const buf = Buffer.alloc(size, 0xaa);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function pngBytes(size = 32): Buffer {
  const buf = Buffer.alloc(size, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  return buf;
}

function webpBytes(size = 32): Buffer {
  const buf = Buffer.alloc(size, 0);
  buf.write('RIFF', 0, 'latin1');
  buf.write('WEBP', 8, 'latin1');
  return buf;
}

function pdfBytes(size = 32): Buffer {
  const buf = Buffer.alloc(size, 0x20);
  buf.write('%PDF-1.4', 0, 'latin1');
  return buf;
}

function svgBytes(): Buffer {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');
}

function htmlBytes(): Buffer {
  return Buffer.from('<html><body><script>alert(1)</script></body></html>', 'utf8');
}

function base64(buf: Buffer): string {
  return buf.toString('base64');
}

describe('validateDocumentUpload — magic-byte sniffing', () => {
  it('accepts a JPEG matching its extension', () => {
    const result = validateDocumentUpload({ kind: 'REQUIREMENT', filename: 'clearance.jpg', contentBase64: base64(jpegBytes()) });
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts a PNG matching its extension', () => {
    const result = validateDocumentUpload({ kind: 'PHOTO', filename: 'photo.png', contentBase64: base64(pngBytes()) });
    expect(result.mimeType).toBe('image/png');
  });

  it('accepts a WEBP matching its extension', () => {
    const result = validateDocumentUpload({ kind: 'PHOTO', filename: 'photo.webp', contentBase64: base64(webpBytes()) });
    expect(result.mimeType).toBe('image/webp');
  });

  it('accepts a PDF matching its extension', () => {
    const result = validateDocumentUpload({ kind: 'REQUIREMENT', filename: 'nbi.pdf', contentBase64: base64(pdfBytes()) });
    expect(result.mimeType).toBe('application/pdf');
  });

  it('rejects an SVG outright — never recognized as an allowed type at all', () => {
    expect(() =>
      validateDocumentUpload({ kind: 'REQUIREMENT', filename: 'evil.svg', contentBase64: base64(svgBytes()) }),
    ).toThrow(ActionError);
  });

  it('rejects an HTML file renamed .png (magic bytes never match, whatever the extension claims)', () => {
    expect(() =>
      validateDocumentUpload({ kind: 'PHOTO', filename: 'photo.png', contentBase64: base64(htmlBytes()) }),
    ).toThrow(ActionError);
  });

  it('rejects a text file declaring image/png via its filename', () => {
    const textBytes = Buffer.from('just some plain text, not an image', 'utf8');
    expect(() =>
      validateDocumentUpload({ kind: 'REQUIREMENT', filename: 'notes.png', contentBase64: base64(textBytes) }),
    ).toThrow(ActionError);
  });

  it('rejects a real PNG whose filename disagrees with its sniffed type', () => {
    expect(() =>
      validateDocumentUpload({ kind: 'REQUIREMENT', filename: 'clearance.pdf', contentBase64: base64(pngBytes()) }),
    ).toThrow(ActionError);
  });

  it('rejects a PDF uploaded as a PHOTO', () => {
    expect(() =>
      validateDocumentUpload({ kind: 'PHOTO', filename: 'scan.pdf', contentBase64: base64(pdfBytes()) }),
    ).toThrow(ActionError);
  });

  it('rejects an empty file', () => {
    expect(() => validateDocumentUpload({ kind: 'PHOTO', filename: 'empty.png', contentBase64: '' })).toThrow(ActionError);
  });
});

describe('validateDocumentUpload — 5 MB size cap on decoded bytes', () => {
  it('accepts exactly 5 MB', () => {
    const buf = jpegBytes(MAX_DOCUMENT_BYTES);
    const result = validateDocumentUpload({ kind: 'PHOTO', filename: 'big.jpg', contentBase64: base64(buf) });
    expect(result.byteSize).toBe(MAX_DOCUMENT_BYTES);
  });

  it('rejects 5 MB + 1 byte', () => {
    const buf = jpegBytes(MAX_DOCUMENT_BYTES + 1);
    expect(() =>
      validateDocumentUpload({ kind: 'PHOTO', filename: 'toobig.jpg', contentBase64: base64(buf) }),
    ).toThrow(ActionError);
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators', () => {
    expect(sanitizeFilename('../../etc/passwd.jpg')).not.toMatch(/[\\/]/);
  });

  it('strips control characters', () => {
    expect(sanitizeFilename('photo\x00\x1f.jpg')).toBe('photo.jpg');
  });

  it('caps length', () => {
    expect(sanitizeFilename('a'.repeat(500) + '.jpg').length).toBeLessThanOrEqual(180);
  });

  it('falls back to a generic name when nothing survives', () => {
    expect(sanitizeFilename('\x00\x01\x02')).toBe('document');
  });
});

// The decoded-size cap in validateDocumentUpload is not, by itself, a limit: it only runs
// after the whole payload has been read and expanded into a second Buffer. The schema
// bound is what actually protects the process, so it is asserted here rather than left
// implicit — and asserted against the same constant the schema uses, so the two cannot
// drift apart.
describe('base64 length bound', () => {
  it('bounds the encoded string, not just the decoded bytes', () => {
    expect(MAX_DOCUMENT_BASE64_LENGTH).toBeGreaterThan((MAX_DOCUMENT_BYTES * 4) / 3);
    // Slack for padding and encoder line breaks, but not so loose it stops being a limit.
    expect(MAX_DOCUMENT_BASE64_LENGTH).toBeLessThan((MAX_DOCUMENT_BYTES * 4) / 3 + 4096);
  });

  it('is enforced by the upload action schema, before anything decodes', () => {
    const oversized = 'A'.repeat(MAX_DOCUMENT_BASE64_LENGTH + 1);
    const parsed = uploadDocumentAction.input.safeParse({
      employeeId: '00000000-0000-4000-8000-000000000001',
      kind: 'PHOTO',
      filename: 'huge.png',
      contentBase64: oversized,
    });
    expect(parsed.success).toBe(false);
  });
});
