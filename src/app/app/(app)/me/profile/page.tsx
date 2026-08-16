import { notFound } from "next/navigation"

import { ProfileScreen } from "@/components/me/profile-screen"
import { isRouteReleased } from "@/components/shell/nav-items"

// Employee self-service is slice 11 and is held back from the first public build. The
// screen still works — hiding the nav entry is what was asked for — but a hidden link is
// not a closed door, so the route itself 404s rather than letting a guessed URL land on
// work that is not part of what shipped. Delete this guard when the slice ships.
export default function ProfilePage() {
  if (!isRouteReleased("/app/me/profile")) notFound()
  return <ProfileScreen />
}
