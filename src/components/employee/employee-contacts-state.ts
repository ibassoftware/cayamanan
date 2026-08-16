// Pure helpers for the Family tab — grouping `employee_contacts` rows by `kind` (widened
// in the 201-file to EMERGENCY | BENEFICIARY | DEPENDENT, see modules/employee/schema.ts).

export const CONTACT_KINDS = ["EMERGENCY", "BENEFICIARY", "DEPENDENT"] as const
export type ContactKind = (typeof CONTACT_KINDS)[number]

export function contactKindLabel(kind: string): string {
  if (kind === "EMERGENCY") return "Emergency contact"
  if (kind === "BENEFICIARY") return "Beneficiary"
  if (kind === "DEPENDENT") return "Dependent"
  return kind
}

export function isContactKind(value: string): value is ContactKind {
  return (CONTACT_KINDS as readonly string[]).includes(value)
}

interface GroupableContact {
  kind: string
  name: string
  isPrimary: boolean
}

/**
 * Buckets contacts by kind and sorts each bucket primary-first, then by name. A row
 * with an unrecognized `kind` (shouldn't happen — the action layer enforces the enum)
 * is dropped rather than crashing the tab; it would never render meaningfully grouped.
 */
export function groupContactsByKind<T extends GroupableContact>(contacts: T[]): Record<ContactKind, T[]> {
  const groups: Record<ContactKind, T[]> = { EMERGENCY: [], BENEFICIARY: [], DEPENDENT: [] }
  for (const contact of contacts) {
    if (isContactKind(contact.kind)) groups[contact.kind].push(contact)
  }
  for (const kind of CONTACT_KINDS) {
    groups[kind].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }
  return groups
}
