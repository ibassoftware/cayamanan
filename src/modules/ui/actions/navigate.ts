import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { describeScreens } from '../screens';

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
  // The description carries the screen catalogue so the model can choose a path itself
  // rather than asking the user what the app's own routes are.
  toolDescription:
    'Change the main screen to an /app page. Never ask the user for a path — pick it from ' +
    `these screens: ${describeScreens()}. If the user wants a screen that is not listed, ` +
    'say it does not exist yet rather than guessing a path.',
  async handler(input) {
    return { path: input.path };
  },
});
