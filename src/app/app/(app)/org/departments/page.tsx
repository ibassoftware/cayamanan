import { Forbidden } from "@/components/shell/forbidden"
import { DepartmentsScreen } from "@/components/org/departments-screen"
import { getServerSession } from "@/lib/session"

export default async function DepartmentsPage() {
  const session = await getServerSession()
  // Usability affordance only — org.listDepartments/etc. re-check ADMIN/HR_PAYROLL
  // server-side regardless (same pattern as settings/users/page.tsx).
  if (!session || !session.roles.some(role => role === "ADMIN" || role === "HR_PAYROLL")) {
    return <Forbidden />
  }

  return <DepartmentsScreen />
}
