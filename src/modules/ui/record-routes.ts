/**
 * Which entity types `ui.openRecord` can actually put on screen, and where they live.
 *
 * This exists because the original action was a slice-03 placeholder: it validated the
 * shape of `{entityType, entityId}` and handed it straight back, leaving "resolve this to
 * a route" to whichever domain slice owned the entity. Slice 04 shipped employee pages and
 * never came back for it, so the tool returned `status: ok` while doing nothing at all —
 * and Missy, correctly trusting a successful tool result, told users their page was open
 * when it was not. A tool that cannot do the thing must fail, not succeed quietly.
 *
 * Adding an entity type here without adding its route is the same bug again. Only list
 * a type once `/app/<...>/[id]` genuinely exists.
 */
const RECORD_ROUTES: Record<string, (id: string) => string> = {
  employee: (id) => `/app/employees/${id}`,
};

/** Entity types that can be opened, for error messages and the tool description. */
export function openableEntityTypes(): string[] {
  return Object.keys(RECORD_ROUTES);
}

/**
 * The `/app` path for a record, or `null` when this entity type has no detail screen.
 * `null` is a real answer — departments, positions, locations and cost centers are
 * list-only today, and sending someone to a fabricated URL would 404.
 */
export function resolveRecordPath(entityType: string, entityId: string): string | null {
  const build = RECORD_ROUTES[entityType.trim().toLowerCase()];
  return build ? build(entityId) : null;
}
