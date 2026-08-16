// Pure helpers for the Personal tab's present/permanent address pair. `employees.address`
// / `employees.permanentAddress` are untyped jsonb on the server (`z.record(z.string(),
// z.unknown())` — modules/employee/actions/update-employee.ts) — this module is the only
// place that gives that blob a concrete shape for the UI, and only ever reads/writes
// known string fields defensively (never trusts the stored shape blindly).
//
// `permanentAddress` is nullable by convention: null means "same as present address",
// per the PH 201-file norm documented on the schema column itself. The "same as present"
// checkbox in the UI is this null-ness made visible/editable, not a separate flag.

export interface EmployeeAddress {
  line1: string
  line2: string
  city: string
  province: string
  postalCode: string
  country: string
}

export const BLANK_ADDRESS: EmployeeAddress = {
  line1: "",
  line2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "",
}

const ADDRESS_KEYS = Object.keys(BLANK_ADDRESS) as (keyof EmployeeAddress)[]

/** Narrows the untyped jsonb blob into known string fields, defensively. */
export function parseAddress(value: unknown): EmployeeAddress {
  if (!value || typeof value !== "object") {
    return { ...BLANK_ADDRESS }
  }
  const record = value as Record<string, unknown>
  const result = { ...BLANK_ADDRESS }
  for (const key of ADDRESS_KEYS) {
    const raw = record[key]
    if (typeof raw === "string") result[key] = raw
  }
  return result
}

/** Trims every field and drops blanks; returns `null` (not `{}`) when nothing is left. */
export function serializeAddress(fields: EmployeeAddress): Record<string, string> | null {
  const entries = ADDRESS_KEYS.map(key => [key, fields[key].trim()] as const).filter(([, value]) => value.length > 0)
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

/** `permanentAddress` is null/undefined -> the "same as present address" checkbox starts checked. */
export function isSameAsPresentAddress(permanentAddress: unknown): boolean {
  return permanentAddress === null || permanentAddress === undefined
}

/** What to send as `permanentAddress` on save, given the checkbox state and entered fields. */
export function resolvePermanentAddressPayload(
  sameAsPresent: boolean,
  permanentFields: EmployeeAddress,
): Record<string, string> | null {
  return sameAsPresent ? null : serializeAddress(permanentFields)
}

/** Display lines for a read-only address view — skips blank lines rather than rendering them. */
export function formatAddressLines(value: unknown): string[] {
  const address = parseAddress(value)
  const cityProvince = [address.city, address.province].filter(part => part.trim().length > 0).join(", ")
  const postalCountry = [address.postalCode, address.country].filter(part => part.trim().length > 0).join(" ")
  return [address.line1, address.line2, cityProvince, postalCountry]
    .map(line => line.trim())
    .filter(line => line.length > 0)
}
