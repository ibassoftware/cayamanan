// Pure derivation of the screen-context "route"/"module" fields
// (03-missy-foundation.md: "a provider publishes {route, module, entityType, entityId,
// filters} with each message") from the current pathname. Kept framework-free so it's
// unit-testable without mounting the provider.

export interface RouteContext {
  route: string
  module: string | null
}

/** `/app/settings/system` -> module "settings"; `/app` or `/app/` -> module null (home). */
export function deriveRouteContext(pathname: string): RouteContext {
  const segments = pathname.split("/").filter(Boolean) // drops leading "" and any trailing slash
  // segments[0] is always "app" for every screen this panel is mounted on.
  const moduleSegment = segments.length > 1 ? segments[1] : null
  return { route: pathname, module: moduleSegment }
}
