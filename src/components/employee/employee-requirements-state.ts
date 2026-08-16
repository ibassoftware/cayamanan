// Pure helpers for the Onboarding tab — `employee_requirements.status` ordering/labels
// (PENDING | SUBMITTED | WAIVED, upserted by `employee.setRequirement` — see
// modules/employee/actions/set-requirement.ts).

export const REQUIREMENT_STATUSES = ["PENDING", "SUBMITTED", "WAIVED"] as const
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]

const STATUS_ORDER: Record<string, number> = { PENDING: 0, SUBMITTED: 1, WAIVED: 2 }

/** Outstanding items first (PENDING), then SUBMITTED, then WAIVED last; unknown statuses sort last. */
export function requirementStatusOrder(status: string): number {
  return STATUS_ORDER[status] ?? REQUIREMENT_STATUSES.length
}

export function requirementStatusLabel(status: string): string {
  if (status === "PENDING") return "Pending"
  if (status === "SUBMITTED") return "Submitted"
  if (status === "WAIVED") return "Waived"
  return status
}

export function requirementStatusBadgeVariant(status: string): "warning" | "success" | "secondary" {
  if (status === "PENDING") return "warning"
  if (status === "SUBMITTED") return "success"
  if (status === "WAIVED") return "secondary"
  return "secondary"
}

interface OrderableRequirement {
  status: string
  requirement: string
}

/** Pending items surface first for follow-up; ties broken alphabetically by requirement name. */
export function sortRequirementsByStatus<T extends OrderableRequirement>(requirements: T[]): T[] {
  return [...requirements].sort((a, b) => {
    const order = requirementStatusOrder(a.status) - requirementStatusOrder(b.status)
    if (order !== 0) return order
    return a.requirement.localeCompare(b.requirement)
  })
}
