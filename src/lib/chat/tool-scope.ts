// Maps a screen's `module` (as derived by `deriveRouteContext`/sent by the client as
// per-message metadata, see `extractScreenModule` in `./screen-context.ts`) to the
// action-id module prefixes Missy's tool bridge offers for that screen
// (`src/mastra/tools/action-tool-bridge.ts`'s scoped mode).
//
// Purely a UX/token affordance, same as everything else in this file: `executeAction`'s
// own role check is still the only authorization boundary, so a wrong or even
// maliciously-supplied entry here can only ever widen or narrow *what's offered* to the
// model, never what may actually run.
//
// A static table, not a 1:1 mirror of the route tree: a screen showing "employees"
// legitimately also needs `org.*` tools (department/position/location lookups for the
// employee form) — that's a product decision about what belongs on that screen, not
// something a route segment name alone could express.
export const MODULE_ACTION_SCOPES: Readonly<Record<string, readonly string[]>> = {
  employees: ["employee", "org"],
  org: ["org"],
  me: ["employee"],
  settings: ["identity", "system"],
}

/**
 * Action-id module prefixes for a screen's module. An unmapped module (a later slice's
 * route landed before this table was updated for it) falls back to the module name
 * itself — the common case where the route segment and the action-id prefix already
 * match — rather than silently offering nothing for that screen.
 */
export function resolveModuleScopes(module: string | null): readonly string[] {
  if (!module) return []
  return MODULE_ACTION_SCOPES[module] ?? [module]
}
