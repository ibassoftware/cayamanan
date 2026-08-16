import { describe, expect, it } from 'vitest';

import {
  buildRelationItems,
  deriveRelationStatusMessage,
  filterRelationOptions,
  isRelationOptionItem,
  type RelationOption,
} from '@/components/data/relation-typeahead-state';

// Pure UI-logic tests for RelationTypeahead (relation-typeahead.tsx) — the Odoo-style
// "Create" / "Create and Edit" decision and the popup's live-region status text, kept
// out of the React component so they're testable without a DOM.
const OPTIONS: RelationOption[] = [
  { id: '1', label: 'Payroll Officer' },
  { id: '2', label: 'Software Engineer' },
];

describe('buildRelationItems', () => {
  it('returns only option items for an empty query', () => {
    const items = buildRelationItems(OPTIONS, '', { quickCreate: true, createAndEdit: true });
    expect(items).toEqual(OPTIONS.map(option => ({ kind: 'option', option })));
  });

  it('offers Create and Create-and-Edit rows when the query matches nothing', () => {
    const items = buildRelationItems(OPTIONS, 'Recruiter', { quickCreate: true, createAndEdit: true });
    expect(items).toEqual([
      { kind: 'option', option: OPTIONS[0] },
      { kind: 'option', option: OPTIONS[1] },
      { kind: 'create', query: 'Recruiter' },
      { kind: 'create-and-edit', query: 'Recruiter' },
    ]);
  });

  it('omits the rows the caller disabled', () => {
    expect(buildRelationItems(OPTIONS, 'Recruiter', { quickCreate: false, createAndEdit: true })).toEqual([
      { kind: 'option', option: OPTIONS[0] },
      { kind: 'option', option: OPTIONS[1] },
      { kind: 'create-and-edit', query: 'Recruiter' },
    ]);
    expect(buildRelationItems(OPTIONS, 'Recruiter', { quickCreate: true, createAndEdit: false })).toEqual([
      { kind: 'option', option: OPTIONS[0] },
      { kind: 'option', option: OPTIONS[1] },
      { kind: 'create', query: 'Recruiter' },
    ]);
  });

  it('does not offer to create a duplicate of an exact (trimmed, case-insensitive) match', () => {
    const items = buildRelationItems(OPTIONS, '  payroll officer  ', {
      quickCreate: true,
      createAndEdit: true,
    });
    expect(items).toEqual(OPTIONS.map(option => ({ kind: 'option', option })));
  });

  it('does offer to create when the query is only a partial match', () => {
    const items = buildRelationItems(OPTIONS, 'Payroll', { quickCreate: true, createAndEdit: false });
    expect(items).toEqual([
      { kind: 'option', option: OPTIONS[0] },
      { kind: 'option', option: OPTIONS[1] },
      { kind: 'create', query: 'Payroll' },
    ]);
  });
});

describe('isRelationOptionItem', () => {
  it('narrows option items and excludes create rows', () => {
    expect(isRelationOptionItem({ kind: 'option', option: OPTIONS[0] })).toBe(true);
    expect(isRelationOptionItem({ kind: 'create', query: 'x' })).toBe(false);
    expect(isRelationOptionItem({ kind: 'create-and-edit', query: 'x' })).toBe(false);
  });
});

describe('deriveRelationStatusMessage', () => {
  it('announces searching while loading', () => {
    expect(deriveRelationStatusMessage({ status: 'loading', query: 'x', resultCount: 0 })).toBe('Searching…');
  });

  it('announces the error message, falling back to a generic one', () => {
    expect(
      deriveRelationStatusMessage({ status: 'error', query: 'x', resultCount: 0, errorMessage: 'Network down.' }),
    ).toBe('Network down.');
    expect(deriveRelationStatusMessage({ status: 'error', query: 'x', resultCount: 0 })).toBe(
      "Couldn't load results. Try again.",
    );
  });

  it('announces nothing for an empty/idle query', () => {
    expect(deriveRelationStatusMessage({ status: 'idle', query: '  ', resultCount: 0 })).toBeNull();
  });

  it('announces no matches for a non-empty query with zero results', () => {
    expect(deriveRelationStatusMessage({ status: 'idle', query: 'zzz', resultCount: 0 })).toBe(
      'No matches for "zzz".',
    );
  });

  it('announces a singular/plural result count', () => {
    expect(deriveRelationStatusMessage({ status: 'idle', query: 'e', resultCount: 1 })).toBe('1 result.');
    expect(deriveRelationStatusMessage({ status: 'idle', query: 'e', resultCount: 2 })).toBe('2 results.');
  });
});

describe('filterRelationOptions', () => {
  it('returns every option, unfiltered, for an empty/whitespace query', () => {
    expect(filterRelationOptions(OPTIONS, '')).toEqual(OPTIONS);
    expect(filterRelationOptions(OPTIONS, '   ')).toEqual(OPTIONS);
  });

  it('matches case-insensitively on a substring of the label', () => {
    expect(filterRelationOptions(OPTIONS, 'payroll')).toEqual([OPTIONS[0]]);
    expect(filterRelationOptions(OPTIONS, 'ENGINEER')).toEqual([OPTIONS[1]]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterRelationOptions(OPTIONS, 'recruiter')).toEqual([]);
  });
});
