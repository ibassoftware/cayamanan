import type { ReactNode } from "react"
import { notFound } from "next/navigation"

/**
 * The design-system gallery is a development aid, not part of the product. It is a client
 * component, so the gate lives here in a server layout rather than inside the page —
 * `notFound()` needs to run on the server, and this covers the whole segment.
 *
 * Unlike `/dev/tools` this page exposes no data, only component samples, so there is no
 * session check — but a public build should not serve a component gallery at all, and
 * before this it did. A real production boot now 404s here, exactly as if the route did
 * not exist, matching `/dev/tools`'s first condition.
 */
export default function DevDesignSystemLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound()
  return <>{children}</>
}
