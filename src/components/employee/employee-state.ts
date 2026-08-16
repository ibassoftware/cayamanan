// Pure, framework-free helpers shared by the employee screens (list, detail, create/edit
// — 04-organization-employees.md). Mirrors the settings-state.ts / users-state.ts split.
// List screens reuse `deriveListScreenState` from data/list-state.ts directly (the
// `employees` array unwrapped from `{ employees, total }`); `total` is tracked
// separately by the screen for server-side pagination.

export type EmployeeStatus = "ACTIVE" | "ON_LEAVE" | "SEPARATED"

// Matches `employee.list`'s output exactly — deliberately has no government IDs or
// personal contact fields (see actions/list-employees.ts's PII-boundary comment); the
// UI never has to remember to hide anything here because the shape itself never carries it.
export interface EmployeeSummary {
  id: string
  employeeNo: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  status: string
  hireDate: string
  photoUrl: string | null
  departmentId: string | null
  positionId: string | null
  locationId: string | null
}

export interface EmployeeGovernmentIds {
  sssNo: string | null
  philhealthNo: string | null
  pagibigNo: string | null
  tin: string | null
  hdmfMid: string | null
}

export interface EmployeeContact {
  id: string
  kind: string
  name: string
  relationship: string | null
  mobile: string | null
}

export interface EmployeeDetail extends EmployeeSummary {
  birthDate: string | null
  sex: string | null
  civilStatus: string | null
  emailPersonal: string | null
  emailWork: string | null
  mobile: string | null
  address: unknown
  governmentIds: EmployeeGovernmentIds | null
  contacts: EmployeeContact[]
}

export function formatEmployeeName(employee: Pick<EmployeeSummary, "firstName" | "middleName" | "lastName" | "suffix">): string {
  const middle = employee.middleName?.trim()
  const suffix = employee.suffix?.trim()
  return [employee.firstName, middle, employee.lastName].filter(Boolean).join(" ") + (suffix ? ` ${suffix}` : "")
}

export function statusBadgeVariant(status: string): "success" | "warning" | "secondary" {
  if (status === "ACTIVE") return "success"
  if (status === "ON_LEAVE") return "warning"
  return "secondary"
}

export function statusLabel(status: string): string {
  if (status === "ACTIVE") return "Active"
  if (status === "ON_LEAVE") return "On leave"
  if (status === "SEPARATED") return "Separated"
  return status
}

