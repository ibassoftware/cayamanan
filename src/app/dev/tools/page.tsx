import { notFound, redirect } from "next/navigation"

import { getServerSession } from "@/lib/session"
import { ErrorPanel } from "@/components/data/state-panels"
import { DevToolsPanel } from "@/components/dev/dev-tools-panel"
import { buildDevToolsData } from "./build-view"

/**
 * Dev-only "tools available to me" panel (docs/plan/03-missy-foundation.md). Not linked
 * from the app nav — mirrors /dev/design-system's placement, but unlike that page this
 * one exposes the action catalogue, so it is gated on two independent conditions before
 * anything is computed:
 *   1. `NODE_ENV === 'development'` — a real production/staging boot 404s here, same as
 *      if the route did not exist.
 *   2. A valid signed-in session (the same server-side cookie check every /app/** route
 *      uses, `getServerSession()`) — an unauthenticated visit redirects to /login exactly
 *      like the app shell layout does.
 * Everything rendered below that point is built from the *viewer's own* verified session
 * (`build-view.ts`'s `buildDevToolsData`), which calls the exact same `buildActionTools`
 * the chat route calls — so the page can never show a tool the viewer's own role could
 * not itself call; it is not a separate, wider view into the registry.
 */
// Never prerendered/statically built: a build-time snapshot of "tools available to me"
// would be meaningless (there is no signed-in viewer at build time) and, worse,
// evaluating the action-register side-effect imports below during a production
// prerender pass re-runs every `defineAction()` call in a context where the same ids
// were already registered by the composition root — which `defineAction` correctly
// throws on outside development (src/platform/actions.ts's dev-only overwrite guard).
// This route reflects live, request-time state (the registry, the caller's session,
// `MISSY_TOOL_SCOPING`) and must always run at request time regardless.
export const dynamic = "force-dynamic"

export default async function DevToolsPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound()
  }

  const session = await getServerSession()
  if (!session) {
    redirect("/login")
  }

  let data: Awaited<ReturnType<typeof buildDevToolsData>> | null = null
  let loadError: string | null = null
  try {
    data = await buildDevToolsData(session)
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Something went wrong loading the tool registry."
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-10">
      <div>
        <h1 className="tc-app-title mb-2">Tools available to me</h1>
        <p className="tc-measure text-body-subtle">
          Dev-only. Not linked from the app nav. Shows exactly the Missy tools your own signed-in role
          resolves to, scoped and unscoped, with each tool&rsquo;s input schema rendered readably.
        </p>
      </div>

      {loadError ? (
        <ErrorPanel title="Couldn't build the tool registry view" message={loadError} />
      ) : data ? (
        <DevToolsPanel data={data} />
      ) : null}
    </div>
  )
}
