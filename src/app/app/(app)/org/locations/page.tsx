import { Forbidden } from "@/components/shell/forbidden"
import { LocationsScreen } from "@/components/org/locations-screen"
import { getServerSession } from "@/lib/session"

export default async function LocationsPage() {
  const session = await getServerSession()
  if (!session || !session.roles.some(role => role === "ADMIN" || role === "HR_PAYROLL")) {
    return <Forbidden />
  }

  return <LocationsScreen />
}
