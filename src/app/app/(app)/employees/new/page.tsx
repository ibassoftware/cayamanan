import { Forbidden } from "@/components/shell/forbidden"
import { NewEmployeeScreen } from "@/components/employee/new-employee-screen"
import { getServerSession } from "@/lib/session"

export default async function NewEmployeePage() {
  const session = await getServerSession()
  if (!session || !session.roles.some(role => role === "ADMIN" || role === "HR_PAYROLL")) {
    return <Forbidden />
  }

  return <NewEmployeeScreen />
}
