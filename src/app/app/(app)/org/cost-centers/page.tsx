import { Forbidden } from "@/components/shell/forbidden"
import { CostCentersScreen } from "@/components/org/cost-centers-screen"
import { getServerSession } from "@/lib/session"

export default async function CostCentersPage() {
  const session = await getServerSession()
  if (!session || !session.roles.some(role => role === "ADMIN" || role === "HR_PAYROLL")) {
    return <Forbidden />
  }

  return <CostCentersScreen />
}
