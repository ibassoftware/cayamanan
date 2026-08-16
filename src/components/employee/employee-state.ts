// Pure, framework-free helpers shared by the employee screens (list, detail, create/edit
// — 04-organization-employees.md, extended for the 201-file rebuild). Mirrors the
// settings-state.ts / users-state.ts split. List screens reuse `deriveListScreenState`
// from data/list-state.ts directly (the `employees` array unwrapped from `{ employees,
// total }`); `total` is tracked separately by the screen for server-side pagination.

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

// Widened for the 201-file: `kind` now includes DEPENDENT, and email/address/birthDate/
// isPrimary — see employee_contacts in modules/employee/schema.ts.
export interface EmployeeContact {
  id: string
  kind: string
  name: string
  relationship: string | null
  mobile: string | null
  email: string | null
  address: string | null
  birthDate: string | null
  isPrimary: boolean
}

export interface EmployeeEducation {
  id: string
  level: string
  school: string
  degree: string | null
  fieldOfStudy: string | null
  startYear: number | null
  endYear: number | null
  honors: string | null
}

export interface EmployeeWorkHistoryEntry {
  id: string
  employer: string
  position: string | null
  startDate: string | null
  endDate: string | null
  reasonForLeaving: string | null
}

export interface EmployeeTrainingEntry {
  id: string
  title: string
  provider: string | null
  startDate: string | null
  endDate: string | null
  // `numeric(8,2)` from `pg` — a string end to end, never parseFloat'd (CLAUDE.md).
  hours: string | null
  certificateNo: string | null
}

export interface EmployeeRequirement {
  id: string
  requirement: string
  status: string
  submittedOn: string | null
  notes: string | null
}

// Metadata only — never carries file content (see modules/employee/service/
// load-employee-detail.ts). Downloading the bytes goes through GET /api/files/[id].
export interface EmployeeDocument {
  id: string
  kind: string
  requirementId: string | null
  filename: string
  mimeType: string
  byteSize: number
  createdAt: string
}

export interface EmployeeDetail extends EmployeeSummary {
  birthDate: string | null
  sex: string | null
  civilStatus: string | null
  emailPersonal: string | null
  emailWork: string | null
  mobile: string | null
  address: unknown
  permanentAddress: unknown
  birthPlace: string | null
  nationality: string | null
  religion: string | null
  bloodType: string | null
  governmentIds: EmployeeGovernmentIds | null
  contacts: EmployeeContact[]
  education: EmployeeEducation[]
  workHistory: EmployeeWorkHistoryEntry[]
  training: EmployeeTrainingEntry[]
  requirements: EmployeeRequirement[]
  documents: EmployeeDocument[]
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

/**
 * Initials for the header avatar's fallback — shown until a PHOTO document is uploaded
 * (see EmployeePhoto/document-state.ts's `selectPhotoDocument`), and again whenever there
 * is none or the image fails to load. Falls back to the employee number's first two
 * characters when both name parts are blank, so the avatar is never empty text.
 */
export function employeeInitials(employee: Pick<EmployeeSummary, "firstName" | "lastName" | "employeeNo">): string {
  const first = employee.firstName.trim().charAt(0)
  const last = employee.lastName.trim().charAt(0)
  const initials = `${first}${last}`.toUpperCase()
  if (initials.length > 0) return initials
  return employee.employeeNo.trim().slice(0, 2).toUpperCase()
}
