import { redirect } from "next/navigation"

import { getServerSession } from "@/lib/session"

// There is no marketing landing page, deliberately: this is an internal HRIS, and the
// root previously rendered a product pitch whose only call to action opened `/chat` — a
// scaffold that has since been deleted. Every visit now lands where the visitor can
// actually do something.
//
// The redirect is a convenience, not a boundary. `/app/**` does its own session check in
// `src/app/app/(app)/layout.tsx`, so sending someone to `/app` here never grants access;
// if the session is stale, that layout bounces them to `/login` anyway.
export default async function RootPage() {
  const session = await getServerSession()
  redirect(session ? "/app" : "/login")
}
