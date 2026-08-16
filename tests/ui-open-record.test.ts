import { describe, expect, it } from 'vitest';

import { openableEntityTypes, resolveRecordPath } from '@/modules/ui/record-routes';
import { openRecordAction } from '@/modules/ui/actions/open-record';

// The regression this file exists for: `ui.openRecord` was still the slice-03 placeholder.
// It validated `{entityType, entityId}` and echoed them straight back, and no client
// handler existed — so the tool always returned `status: ok` while the screen never
// changed, and Missy told users "her page is now open" when it was not. A tool that cannot
// do the thing must fail loudly, not succeed quietly.
describe('resolveRecordPath', () => {
  it('resolves an employee to its detail route', () => {
    expect(resolveRecordPath('employee', 'd5442b1c-a630-4c9f-b299-62d2782154f6')).toBe(
      '/app/employees/d5442b1c-a630-4c9f-b299-62d2782154f6',
    );
  });

  it('is case- and whitespace-insensitive on the entity type', () => {
    expect(resolveRecordPath('  Employee ', 'abc')).toBe('/app/employees/abc');
  });

  // Departments, positions, locations and cost centers are list-only today. Inventing
  // `/app/org/departments/<id>` would send the user to a 404, which is worse than an
  // honest refusal.
  it('returns null for an entity type with no detail screen', () => {
    for (const type of ['department', 'position', 'location', 'costCenter', 'payslip', '']) {
      expect(resolveRecordPath(type, 'abc')).toBeNull();
    }
  });

  it('advertises exactly what it can open', () => {
    expect(openableEntityTypes()).toEqual(['employee']);
  });
});

describe('ui.openRecord action', () => {
  const ctx = {} as never;

  it('returns a resolved path, not just an echo of its own input', async () => {
    const result = await openRecordAction.handler(
      { entityType: 'employee', entityId: 'd5442b1c-a630-4c9f-b299-62d2782154f6' },
      ctx,
    );
    expect(result.path).toBe('/app/employees/d5442b1c-a630-4c9f-b299-62d2782154f6');
  });

  it('fails rather than reporting success for a type it cannot open', async () => {
    await expect(
      openRecordAction.handler({ entityType: 'department', entityId: 'd5442b1c-a630-4c9f-b299-62d2782154f6' }, ctx),
    ).rejects.toThrow(/no dedicated page/i);
  });

  it('rejects a non-uuid id at the schema boundary', () => {
    expect(openRecordAction.input.safeParse({ entityType: 'employee', entityId: 'not-a-uuid' }).success).toBe(false);
  });
});
