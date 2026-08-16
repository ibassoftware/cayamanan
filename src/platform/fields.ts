// Shared zod field builders — validation and a terse `.describe()` together, so a
// slice-05+ author gets the model-facing description for free instead of remembering to
// write one. Every tool schema is sent to Missy on every request (measured in
// tests/missy-tool-payload.test.ts), and before this module existed there were zero
// `.describe()` calls anywhere in the codebase: the model saw `code: string`,
// `hdmfMid: string`, `effectiveFrom: string` with nothing but the field name to go on —
// on an HRIS that is how a plausible-looking wrong write happens.
//
// Each builder reproduces the exact validation an ad-hoc `z.string()...` declaration
// already had at its call site — never a new or tightened constraint — and adds only a
// short noun-phrase description. A field whose name is already self-evident (`title`,
// `name`) needs no builder and no `.describe()` at all; a genuinely one-off field gets a
// plain `.describe()` at its own call site, not a new builder here (one builder per
// *reusable* field shape, not one per field).
import { z } from 'zod';

/**
 * Short, unique, human-typed code identifying an org reference record (department,
 * position, location, cost center) within its tenant+company — e.g. "FIN", "HR-MGR".
 * Same validation every `org.create*` action already used (`z.string().min(1)`).
 */
export function orgCode(): z.ZodString {
  return z.string().min(1).describe('Short unique code (e.g. "FIN").');
}

/**
 * An employee's human-facing identifier — short and safe to transcribe, unlike the
 * underlying UUID. Immutable after `employee.create` (see update-employee.ts).
 */
export function employeeNo(): z.ZodString {
  return z.string().min(1).describe('Employee number (e.g. "EMP-0001").');
}

/** Calendar date only, no time component — `YYYY-MM-DD`. Same `z.string().date()` every
 * call site already used. */
export function isoDate(): z.ZodString {
  return z.string().date().describe('Date as YYYY-MM-DD.');
}

/**
 * UUID referencing another entity's primary key. `noun` names what it points to, e.g.
 * `uuidRef('department')` -> "UUID of the department." Prefer a natural-key alternative
 * (`code`/`employeeNo`/...) over this when the target action offers one — see
 * `@/platform/id-or-key`, which already covers that "id-or-key" selector shape; this
 * builder is for a plain reference field with no such alternative (e.g.
 * `employee.create`'s `departmentId`).
 */
export function uuidRef(noun: string): z.ZodString {
  return z.string().uuid().describe(`UUID of the ${noun}.`);
}

// Philippine statutory identifiers (employee_government_ids). Deliberately plain
// `z.string()` — no fixed input-time format is enforced today (each agency's own
// formatting has varied over the years and this was never validated at this layer; see
// update-government-ids.ts), so these builders only add the description, never a new
// format constraint. A real format check (e.g. SSS's NN-NNNNNNN-N mask) would be a
// deliberate, separate decision for whoever owns this table — flagging it here rather
// than silently tightening what the API accepts.
export function sssNo(): z.ZodString {
  return z.string().describe('SSS number.');
}

export function philhealthNo(): z.ZodString {
  return z.string().describe('PhilHealth number.');
}

/** `employee_government_ids.pagibig_no` — kept distinct from `hdmfMid` below (same
 * agency, two different stored identifiers; see that builder's comment). */
export function pagibigNo(): z.ZodString {
  return z.string().describe('Pag-IBIG number.');
}

export function tin(): z.ZodString {
  return z.string().describe('BIR Tax Identification Number (TIN).');
}

/**
 * `employee_government_ids.hdmf_mid` — HDMF is Pag-IBIG's legal name (Home Development
 * Mutual Fund), so this and `pagibigNo` read as near-duplicates from the field name
 * alone; they are in fact two separate stored columns (see schema.ts). Flagged, not
 * fixed here: worth a domain-owner decision on whether `hdmfMid` should be renamed to
 * something that doesn't require this comment to disambiguate (e.g. `pagibigMid`) —
 * out of scope for a metadata-only change.
 */
export function hdmfMid(): z.ZodString {
  return z.string().describe('HDMF (Pag-IBIG) Membership ID — distinct from pagibigNo.');
}
