// Pure helpers for the Background tab — education level labels and most-recent-first
// ordering for education/work history/training rows (all optional, undated-friendly:
// an in-progress record with no end date/year is treated as current and sorts first).

export const EDUCATION_LEVELS = [
  "ELEMENTARY",
  "SECONDARY",
  "SENIOR_HIGH",
  "VOCATIONAL",
  "COLLEGE",
  "GRADUATE",
] as const
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  ELEMENTARY: "Elementary",
  SECONDARY: "Secondary / High school",
  SENIOR_HIGH: "Senior high school",
  VOCATIONAL: "Vocational",
  COLLEGE: "College",
  GRADUATE: "Graduate studies",
}

export function educationLevelLabel(level: string): string {
  return EDUCATION_LEVEL_LABELS[level] ?? level
}

interface YearRanged {
  startYear: number | null
  endYear: number | null
}

/** Ongoing (no `endYear`) sorts first as "current"; otherwise most recently ended first. */
export function sortEducationByRecency<T extends YearRanged>(rows: T[]): T[] {
  const key = (row: T) => row.endYear ?? Number.POSITIVE_INFINITY
  return [...rows].sort((a, b) => key(b) - key(a) || (b.startYear ?? 0) - (a.startYear ?? 0))
}

interface DateRanged {
  startDate: string | null
  endDate: string | null
}

/** Ongoing (no `endDate`) sorts first as "current"; ISO dates compare correctly as strings. */
export function sortByDateRangeRecency<T extends DateRanged>(rows: T[]): T[] {
  const key = (row: T) => row.endDate ?? "9999-99-99"
  return [...rows].sort((a, b) => {
    if (key(a) === key(b)) return (b.startDate ?? "").localeCompare(a.startDate ?? "")
    return key(b).localeCompare(key(a))
  })
}
