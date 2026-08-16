import { describe, expect, it } from 'vitest';

import {
  buildMessageText,
  formatAttachmentRowCount,
  formatAttachmentSize,
  hasAllowedAttachmentExtension,
  stripDataUrlPrefix,
  validateAttachmentPick,
} from '@/components/chat/chat-attachment-state';

describe('hasAllowedAttachmentExtension / validateAttachmentPick', () => {
  it('accepts .csv, .tsv and .txt, case-insensitively', () => {
    expect(hasAllowedAttachmentExtension('employees.CSV')).toBe(true);
    expect(hasAllowedAttachmentExtension('data.tsv')).toBe(true);
    expect(hasAllowedAttachmentExtension('notes.txt')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(hasAllowedAttachmentExtension('employees.xlsx')).toBe(false);
    expect(hasAllowedAttachmentExtension('photo.png')).toBe(false);
    expect(hasAllowedAttachmentExtension('noextension')).toBe(false);
  });

  it('validateAttachmentPick rejects a disallowed extension before ever reading the file', () => {
    const result = validateAttachmentPick({ name: 'employees.xlsx', size: 100 });
    expect(result.ok).toBe(false);
  });

  it('validateAttachmentPick rejects an empty file', () => {
    const result = validateAttachmentPick({ name: 'employees.csv', size: 0 });
    expect(result.ok).toBe(false);
  });

  it('validateAttachmentPick rejects a file over the client-side convenience cap', () => {
    const result = validateAttachmentPick({ name: 'employees.csv', size: 3_000_000 });
    expect(result.ok).toBe(false);
  });

  it('validateAttachmentPick accepts a small, allowed file', () => {
    expect(validateAttachmentPick({ name: 'employees.csv', size: 1024 })).toEqual({ ok: true });
  });
});

describe('formatAttachmentSize / formatAttachmentRowCount', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatAttachmentSize(512)).toBe('512 B');
    expect(formatAttachmentSize(2048)).toBe('2.0 KB');
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('pluralizes row counts correctly', () => {
    expect(formatAttachmentRowCount(1)).toBe('1 row');
    expect(formatAttachmentRowCount(0)).toBe('0 rows');
    expect(formatAttachmentRowCount(42)).toBe('42 rows');
  });
});

describe('stripDataUrlPrefix', () => {
  it('removes the data URL prefix, leaving only the base64 payload', () => {
    expect(stripDataUrlPrefix('data:text/csv;base64,aGVsbG8=')).toBe('aGVsbG8=');
  });

  it('returns the input unchanged if there is no comma', () => {
    expect(stripDataUrlPrefix('aGVsbG8=')).toBe('aGVsbG8=');
  });
});

describe('buildMessageText', () => {
  it('returns the text unchanged when there is no attachment', () => {
    expect(buildMessageText('hello')).toBe('hello');
  });

  it('appends a reference — filename, row count and id, never file content', () => {
    const text = buildMessageText('please import these', {
      id: '11111111-1111-4111-8111-111111111111',
      filename: 'employees.csv',
      rowCount: 42,
    });
    expect(text).toContain('please import these');
    expect(text).toContain('employees.csv');
    expect(text).toContain('42 rows');
    expect(text).toContain('11111111-1111-4111-8111-111111111111');
  });

  it('uses only the reference when the user typed no text', () => {
    const text = buildMessageText('', { id: 'abc', filename: 'a.csv', rowCount: 1 });
    expect(text).toContain('a.csv');
    expect(text).toContain('1 row');
    expect(text.startsWith('[Attached file:')).toBe(true);
  });
});
