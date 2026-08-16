/**
 * The screens Missy is allowed to navigate to, and what each one is for.
 *
 * `ui.navigate` validates only that a path is an internal `/app` route (an open-redirect
 * guard, not a whitelist), but the model still needs to *know* what exists — without this
 * it answers "what is the department-management screen's app path?" and asks the user,
 * which is the opposite of useful.
 *
 * Add a screen here when you add a route. Paths that 404 must not be listed: sending the
 * user to a dead page is worse than saying the screen doesn't exist yet.
 */
export const APP_SCREENS: readonly { path: string; describes: string }[] = [
  { path: '/app', describes: 'Home / module overview' },
  { path: '/app/employees', describes: 'Employee list — search, filter by department and status' },
  { path: '/app/employees/new', describes: 'Create a new employee' },
  { path: '/app/org/departments', describes: 'Departments — list, create, edit, archive' },
  { path: '/app/org/positions', describes: 'Positions / job titles — list, create, edit, archive' },
  { path: '/app/org/locations', describes: 'Work locations — list, create, edit, archive' },
  { path: '/app/org/cost-centers', describes: 'Cost centers — list, create, edit, archive' },
  { path: '/app/settings/users', describes: 'User accounts and roles (admin only)' },
  { path: '/app/settings/system', describes: 'System settings (admin only)' },
  { path: '/app/me/profile', describes: 'The signed-in user’s own employee profile' },
  { path: '/app/me/security', describes: 'Change your own password' },
];

/** Rendered into `ui.navigate`'s tool description so the model can pick a path itself. */
export function describeScreens(): string {
  return APP_SCREENS.map((s) => `${s.path} — ${s.describes}`).join('; ');
}
