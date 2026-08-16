import { Forbidden } from "@/components/shell/forbidden"
import { EmployeesScreen } from "@/components/employee/employees-screen"
import { getServerSession } from "@/lib/session"

export default async function EmployeesPage() {
  const session = await getServerSession()
  // Usability affordance — the boundary that actually matters is `employee.list`'s own
  // ADMIN/HR_PAYROLL role check (04-organization-employees.md acceptance criterion 6:
  // an Employee gets 403 here on direct navigation, not just a hidden nav entry).
  if (!session || !session.roles.some(role => role === "ADMIN" || role === "HR_PAYROLL")) {
    return <Forbidden />
  }

  return <EmployeesScreen />
}
