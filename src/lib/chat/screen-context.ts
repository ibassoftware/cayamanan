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

/**
 * Pulls just the `module` field out of the per-message metadata the chat panel attaches
 * to every outgoing message (`src/components/chat/chat-provider.tsx`'s
 * `sendChatMessage({ text, metadata: screenContextRef.current })`, itself the
 * `ScreenContext` published by `src/lib/screen-context.tsx`). Read server-side by
 * `src/app/api/chat/route.ts` to scope Missy's toolset for the request
 * (`src/mastra/tools/action-tool-bridge.ts`).
 *
 * This is client-supplied JSON on the wire, not a value from `deriveRouteContext` — the
 * server never re-derives it and must not trust its shape. Only ever used to widen or
 * narrow which tools are *offered*; `executeAction`'s role check is what may run, and
 * that reads from the verified session alone, never from this.
 */
export function extractScreenModule(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const value = (metadata as { module?: unknown }).module
  return typeof value === "string" ? value : null
}
