import { z } from 'zod';

import { defineAction } from '@/platform/actions';

// The focus tool (03-missy-foundation.md: "ui.openRecord"). No domain entities exist yet
// in this slice — resolving entityType/entityId to an actual route/panel is left to the
// domain slice that owns that entity type; this action only validates presence/shape and
// hands the request back for the chat panel to interpret.
export const openRecordAction = defineAction({
  id: 'ui.openRecord',
  title: 'Open a record',
  input: z.object({ entityType: z.string().min(1), entityId: z.string().min(1) }).strict(),
  output: z.object({ entityType: z.string(), entityId: z.string() }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Bring a specific record (e.g. an employee or a user) into focus on screen.',
  async handler(input) {
    return { entityType: input.entityType, entityId: input.entityId };
  },
});
