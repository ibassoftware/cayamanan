// Pure display-formatting helpers for the 201-file screen — dates, ranges and hours
// rendered for humans, never as raw ISO strings or literal `null`/`undefined` (task
// packet's quality bar). Deliberately string-in/string-out: no `Date` arithmetic that
// could drift by a timezone, since these are calendar dates with no time component.

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

export const EMPTY_VALUE = "—"

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/

/** "2026-01-15" -> "Jan 15, 2026". Falls back to the raw string if it isn't ISO-shaped. */
export function formatHumanDate(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return value
  const [, year, month, day] = match
  const monthIndex = Number(month) - 1
  const label = MONTH_LABELS[monthIndex]
  if (!label) return value
  return `${label} ${Number(day)}, ${year}`
}

/** A start/end date pair, e.g. "Jan 2024 – Present" or "Jan 2020 – Mar 2022". */
export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return EMPTY_VALUE
  const startLabel = start ? formatHumanDate(start) : EMPTY_VALUE
  const endLabel = end ? formatHumanDate(end) : "Present"
  return `${startLabel} – ${endLabel}`
}

/** A start/end year pair for education records, e.g. "2010 – 2014" or "2020 – Present". */
export function formatYearRange(start: number | null | undefined, end: number | null | undefined): string {
  if (!start && !end) return EMPTY_VALUE
  const startLabel = start ? String(start) : EMPTY_VALUE
  const endLabel = end ? String(end) : "Present"
  return `${startLabel} – ${endLabel}`
}

/** Training duration — `hours` is a decimal string end to end (CLAUDE.md), never parsed. */
export function formatHours(hours: string | null | undefined): string {
  if (!hours) return EMPTY_VALUE
  return `${hours} hrs`
}

/** Any nullable/blank display string -> the placeholder dash, never `null`/`undefined` text. */
export function displayOrDash(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : EMPTY_VALUE
}

/**
 * A row's secondary/meta line is often built by joining several optional fields (e.g.
 * `[formatDateRange(...), reasonForLeaving].filter(Boolean).join(" · ")`). When every
 * field was empty, `formatDateRange`/`formatYearRange` still return the placeholder
 * dash (it's truthy, so `.filter(Boolean)` can't drop it), and the join collapses to a
 * line that is just that dash on its own — zero information, purely wasted row height.
 * This drops the line entirely in that case; a dash that's part of a longer joined
 * string (e.g. "— · Resigned") is left alone, since that line still carries real content.
 */
export function dropPlaceholderLine(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? ""
  return trimmed.length === 0 || trimmed === EMPTY_VALUE ? undefined : trimmed
}
