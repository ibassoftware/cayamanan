import Link from "next/link"
import { ShieldAlert } from "lucide-react"

import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/**
 * Global 403 — rendered when a signed-in user without the right role reaches a screen
 * that requires one (e.g. an Employee opening /app/settings/users). This is a usability
 * affordance: the action layer already returns FORBIDDEN for the underlying request
 * regardless of whether this page renders at all.
 */
export function Forbidden() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="mb-1">
          <ShieldAlert className="size-5 text-fg-danger" aria-hidden="true" />
        </div>
        <CardTitle>You don&rsquo;t have permission to view this page</CardTitle>
        <CardDescription>
          This screen is restricted to certain roles. If you need access, ask an
          administrator.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" nativeButton={false} render={<Link href="/app" />}>
          Back to home
        </Button>
      </CardFooter>
    </Card>
  )
}
