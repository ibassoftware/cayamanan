import { describe, expect, it } from 'vitest';

import {
  deriveListScreenState,
  filterBySearch,
  nextSortState,
  paginateRows,
  sortRows,
} from '@/components/data/list-state';

// Pure UI-logic tests for the shared DataTable (src/components/data/data-table.tsx),
// mirroring the settings-screen-state.test.ts / users-screen-state.test.ts split: the
// state-machine and small transforms live away from React so they're testable without
// a DOM, and every model screen built on DataTable reuses (and trusts) the same logic.
describe('deriveListScreenState', () => {
  it('is loading while no result has arrived yet', () => {
    expect(deriveListScreenState(null)).toEqual({ status: 'loading' });
  });

  it('maps a FORBIDDEN action error to the no-permission state', () => {
    const state = deriveListScreenState({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
    });
    expect(state).toEqual({ status: 'no-permission' });
  });

  it('maps any other action error to the generic error state, preserving the message', () => {
    const state = deriveListScreenState({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    expect(state).toEqual({ status: 'error', message: 'Something went wrong. Please try again.' });
  });

  it('is ready with an empty list', () => {
    expect(deriveListScreenState({ ok: true, data: [] })).toEqual({ status: 'ready', items: [] });
  });

  it('is ready with the returned items otherwise', () => {
    const items = [{ id: '1' }];
    expect(deriveListScreenState({ ok: true, data: items })).toEqual({ status: 'ready', items });
  });
});

describe('nextSortState', () => {
  it('starts ascending on a column with no current sort', () => {
    expect(nextSortState(null, 'name')).toEqual({ columnId: 'name', direction: 'asc' });
  });

  it('starts ascending when switching to a different column', () => {
    expect(nextSortState({ columnId: 'name', direction: 'desc' }, 'code')).toEqual({
      columnId: 'code',
      direction: 'asc',
    });
  });

  it('cycles asc -> desc -> unsorted on the same column', () => {
    expect(nextSortState({ columnId: 'name', direction: 'asc' }, 'name')).toEqual({
      columnId: 'name',
      direction: 'desc',
    });
    expect(nextSortState({ columnId: 'name', direction: 'desc' }, 'name')).toBeNull();
  });
});

interface Row {
  id: string;
  name: string;
  headcount: number | null;
}

const ROWS: Row[] = [
  { id: '1', name: 'Finance', headcount: 12 },
  { id: '2', name: 'Engineering', headcount: 34 },
  { id: '3', name: 'HR', headcount: null },
];

function getValue(row: Row, columnId: string) {
  if (columnId === 'name') return row.name;
  if (columnId === 'headcount') return row.headcount;
  return undefined;
}

describe('sortRows', () => {
  it('returns the rows unchanged when there is no sort', () => {
    expect(sortRows(ROWS, null, getValue)).toEqual(ROWS);
  });

  it('sorts strings ascending/descending', () => {
    const asc = sortRows(ROWS, { columnId: 'name', direction: 'asc' }, getValue);
    expect(asc.map(r => r.name)).toEqual(['Engineering', 'Finance', 'HR']);

    const desc = sortRows(ROWS, { columnId: 'name', direction: 'desc' }, getValue);
    expect(desc.map(r => r.name)).toEqual(['HR', 'Finance', 'Engineering']);
  });

  it('sorts numbers, putting null/undefined values first', () => {
    const asc = sortRows(ROWS, { columnId: 'headcount', direction: 'asc' }, getValue);
    expect(asc.map(r => r.id)).toEqual(['3', '1', '2']);
  });

  it('does not mutate the input array', () => {
    const copy = [...ROWS];
    sortRows(ROWS, { columnId: 'name', direction: 'asc' }, getValue);
    expect(ROWS).toEqual(copy);
  });
});

describe('filterBySearch', () => {
  it('returns all rows for an empty/whitespace query', () => {
    expect(filterBySearch(ROWS, '   ', r => r.name)).toEqual(ROWS);
  });

  it('matches case-insensitively on a substring', () => {
    expect(filterBySearch(ROWS, 'fin', r => r.name)).toEqual([ROWS[0]]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterBySearch(ROWS, 'zzz', r => r.name)).toEqual([]);
  });
});

describe('paginateRows', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));

  it('slices the requested page', () => {
    const result = paginateRows(many, 1, 5);
    expect(result.pageRows).toHaveLength(5);
    expect(result.pageRows[0].id).toBe('0');
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(1);
  });

  it('clamps a page below 1 up to 1', () => {
    expect(paginateRows(many, 0, 5).page).toBe(1);
  });

  it('clamps a page beyond the last page down to the last page', () => {
    expect(paginateRows(many, 99, 5).page).toBe(3);
  });

  it('treats an empty list as a single (empty) page', () => {
    const result = paginateRows([], 1, 5);
    expect(result).toEqual({ pageRows: [], page: 1, totalPages: 1 });
  });
});
