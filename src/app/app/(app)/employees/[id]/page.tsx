import { Forbidden } from "@/components/shell/forbidden"
import { EmployeeDetailScreen } from "@/components/employee/employee-detail-screen"
import { getServerSession } from "@/lib/session"

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session || !session.roles.some(role => role === "ADMIN" || role === "HR_PAYROLL")) {
    return <Forbidden />
  }

  const { id } = await params
  return <EmployeeDetailScreen employeeId={id} canLinkAccount={session.roles.includes("ADMIN")} />
}
