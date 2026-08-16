import { Forbidden } from "@/components/shell/forbidden"
import { PositionsScreen } from "@/components/org/positions-screen"
import { getServerSession } from "@/lib/session"

export default async function PositionsPage() {
  const session = await getServerSession()
  if (!session || !session.roles.some(role => role === "ADMIN" || role === "HR_PAYROLL")) {
    return <Forbidden />
  }

  return <PositionsScreen />
}
