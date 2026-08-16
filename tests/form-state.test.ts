import { describe, expect, it } from 'vitest';

import { isDirty, requiredString } from '@/components/data/form/form-state';

// Pure UI-logic tests for the shared create/edit form primitives
// (src/components/data/form/*.tsx).
describe('requiredString', () => {
  it('rejects an empty/whitespace-only value', () => {
    expect(requiredString()('   ')).toEqual({ ok: false, message: 'This field is required.' });
  });

  it('accepts and trims a custom message', () => {
    const validate = requiredString('Enter a name.');
    expect(validate('   ')).toEqual({ ok: false, message: 'Enter a name.' });
    expect(validate('  Finance  ')).toEqual({ ok: true, value: 'Finance' });
  });
});

describe('isDirty', () => {
  it('is false when current matches initial', () => {
    expect(isDirty({ name: 'Finance', code: 'FIN' }, { name: 'Finance', code: 'FIN' })).toBe(false);
  });

  it('is true when any tracked field changed', () => {
    expect(isDirty({ name: 'Finance', code: 'FIN' }, { name: 'Finance', code: 'FIN2' })).toBe(true);
  });

  it('ignores keys not present in the initial snapshot', () => {
    // isDirty only walks the keys of `initial`; both objects here share the same
    // subset of tracked keys, so an extra field on `current` alone doesn't matter.
    const initial = { name: 'Finance' };
    const current = { name: 'Finance', code: 'FIN' } as unknown as typeof initial;
    expect(isDirty(initial, current)).toBe(false);
  });
});
