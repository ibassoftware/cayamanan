// Pure helpers for the confirmation card's expiry state (03-missy-foundation.md
// criterion 5: "waiting 6 minutes and approving fails with expiry"). Framework-free so
// this is unit-testable without a DOM — the card component only calls these.

export function isConfirmationExpired(expiresAtIso: string, nowMs: number): boolean {
  const expiresAtMs = Date.parse(expiresAtIso)
  if (Number.isNaN(expiresAtMs)) return true
  return expiresAtMs <= nowMs
}

/** Rounded-down whole seconds remaining, floored at 0 (never negative). */
export function secondsUntilExpiry(expiresAtIso: string, nowMs: number): number {
  const expiresAtMs = Date.parse(expiresAtIso)
  if (Number.isNaN(expiresAtMs)) return 0
  return Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000))
}

/** "4:59" style countdown for display next to the Approve button. */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
