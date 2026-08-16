import { z } from 'zod';

import { defineAction } from '@/platform/actions';

// The navigation tool (03-missy-foundation.md: "Navigation tool ui.navigate and focus
// tool ui.openRecord"). This action never touches the database — it validates the
// requested path is an internal `/app/*` route (never an absolute URL/external redirect)
// and hands the exact string back; the chat panel (a separate UI task) is what actually
// changes the route when it sees this tool's result. Deterministic validation, not a
// route whitelist tied to the sidebar's nav model (src/components/shell/nav-items.ts) —
// that stays the UI layer's own concern; this action only guards against an open
// redirect, not "is this a real page".
const APP_PATH_RE = /^\/app(\/[a-zA-Z0-9_-]+)*\/?$/;

export const navigateAction = defineAction({
  id: 'ui.navigate',
  title: 'Navigate to a page',
  input: z.object({ path: z.string().regex(APP_PATH_RE, 'Must be an internal /app path.') }).strict(),
  output: z.object({ path: z.string() }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
  scope: 'company',
  toolExposed: true,
  toolDescription: 'Change the main screen to a given /app page (e.g. /app/settings/system).',
  async handler(input) {
    return { path: input.path };
  },
});
