import { Forbidden } from "@/components/shell/forbidden"
import { UsersScreen } from "@/components/settings/users-screen"
import { getServerSession } from "@/lib/session"

export default async function UsersPage() {
  const session = await getServerSession()
  // The layout above already redirects an unauthenticated visit; this is the
  // role gate. It's a usability affordance, same as the sidebar filtering — the
  // identity.listUsers/etc. actions re-check ADMIN server-side regardless.
  if (!session || !session.roles.includes("ADMIN")) {
    return <Forbidden />
  }

  return <UsersScreen currentUserId={session.userId} />
}
