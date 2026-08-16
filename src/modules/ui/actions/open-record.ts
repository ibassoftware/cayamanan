import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { openableEntityTypes, resolveRecordPath } from '../record-routes';

// The focus tool (03-missy-foundation.md: "ui.openRecord").
//
// This used to be the slice-03 placeholder: it validated `{entityType, entityId}` and
// echoed them back, leaving route resolution "to the domain slice that owns that entity
// type". Slice 04 shipped employee pages and never came back for it, so the tool reported
// success while doing nothing, and Missy — reasonably trusting an `ok` result — told users
// their page was open when the screen had not changed.
//
// It now resolves a real `/app` path (src/modules/ui/record-routes.ts) and returns it, so
// the chat panel can push it through exactly the same client-side mechanism `ui.navigate`
// already uses. An entity type with no detail screen is an error, not a quiet success.
export const openRecordAction = defineAction({
  id: 'ui.openRecord',
  title: 'Open a record',
  input: z
    .object({
      entityType: z
        .string()
        .min(1)
        .describe(`The kind of record to open. Currently openable: ${openableEntityTypes().join(', ')}.`),
      entityId: z.string().uuid().describe('The record’s id.'),
    })
    .strict(),
  output: z.object({ entityType: z.string(), entityId: z.string(), path: z.string() }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'company',
  toolExposed: true,
  toolDescription:
    `Open a specific record's own page. Only these entity types have one: ${openableEntityTypes().join(', ')}. ` +
    'For anything else there is no detail screen — use ui.navigate to open the relevant list instead of guessing a path.',
  async handler(input) {
    const path = resolveRecordPath(input.entityType, input.entityId);
    if (!path) {
      // A named failure, so Missy can say what she actually can do rather than claiming
      // to have opened something. Departments, positions, locations and cost centers are
      // list-only today.
      throw new ActionError(
        'VALIDATION_ERROR',
        `There is no dedicated page for a "${input.entityType}" record. Openable types: ${openableEntityTypes().join(', ')}.`,
        { field: 'entityType' },
      );
    }
    return { entityType: input.entityType, entityId: input.entityId, path };
  },
});
