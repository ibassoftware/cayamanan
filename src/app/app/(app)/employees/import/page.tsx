import { Forbidden } from "@/components/shell/forbidden"
import { EmployeeImportScreen } from "@/components/employee/employee-import-screen"
import { getServerSession } from "@/lib/session"

export default async function EmployeeImportPage() {
  const session = await getServerSession()
  // Usability affordance — employee.importPreview/employee.importCommit's own
  // ADMIN/HR_PAYROLL role check is the real boundary, same as /app/employees/new.
  if (!session || !session.roles.some((role) => role === "ADMIN" || role === "HR_PAYROLL")) {
    return <Forbidden />
  }

  return <EmployeeImportScreen />
}
