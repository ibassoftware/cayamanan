// Bounds, persistence and keyboard math for Missy's resizable desktop chat panel
// (product ask: "resizeable instead of fixed" — see chat-panel.tsx / chat-resize-handle.tsx).
// Only applies to the docked `lg`+ column; the mobile overlay is always full-screen and
// never reads this.
//
// Storage is injected (`Pick<Storage, ...>`) rather than reaching for `window.localStorage`
// directly, so this stays unit-testable without a DOM — same pattern as thread-storage.ts.
export const PANEL_WIDTH_STORAGE_KEY = "missy.panelWidth"

export type SimpleStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

// Bounds (px), chosen for a 1024px+ (`lg`) docked column:
// - MIN 320: below this the composer (textarea + submit button) and header controls
//   (thread list + collapse) start crowding — the floor for "still usable".
// - MAX 480: above this the panel starts starving the main content column, especially
//   near the low end of the `lg` range (1024px viewport - 240px sidebar - handle - panel
//   leaves ~280px of main content at the max).
// - DEFAULT 384: matches the previous fixed width (`w-96`), so a user who never resizes
//   sees no visual change.
export const MIN_PANEL_WIDTH = 320
export const MAX_PANEL_WIDTH = 480
export const DEFAULT_PANEL_WIDTH = 384

// Arrow-key / Page-key step sizes (px) for the resize handle.
export const PANEL_WIDTH_STEP = 16
export const PANEL_WIDTH_PAGE_STEP = 64

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PANEL_WIDTH
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width)))
}

export function getPersistedPanelWidth(storage: SimpleStorage): number {
  const raw = storage.getItem(PANEL_WIDTH_STORAGE_KEY)
  if (!raw) return DEFAULT_PANEL_WIDTH
  const parsed = Number(raw)
  return clampPanelWidth(parsed)
}

export function setPersistedPanelWidth(storage: SimpleStorage, width: number): void {
  storage.setItem(PANEL_WIDTH_STORAGE_KEY, String(clampPanelWidth(width)))
}

// The panel is docked on the right, so dragging the handle left (clientX decreasing)
// widens it and dragging right narrows it.
export function nextPanelWidthForPointerDelta(startWidth: number, deltaX: number): number {
  return clampPanelWidth(startWidth - deltaX)
}

// WAI-ARIA "window splitter" keyboard interaction: ArrowLeft/ArrowRight nudge the
// splitter, Home/End jump to the bounds. Returns null for keys this handle doesn't use,
// so the caller knows not to preventDefault (and e.g. Escape still bubbles to collapse).
export function nextPanelWidthForKey(current: number, key: string): number | null {
  switch (key) {
    case "ArrowLeft":
      return clampPanelWidth(current + PANEL_WIDTH_STEP)
    case "ArrowRight":
      return clampPanelWidth(current - PANEL_WIDTH_STEP)
    case "PageUp":
      return clampPanelWidth(current + PANEL_WIDTH_PAGE_STEP)
    case "PageDown":
      return clampPanelWidth(current - PANEL_WIDTH_PAGE_STEP)
    case "Home":
      return MIN_PANEL_WIDTH
    case "End":
      return MAX_PANEL_WIDTH
    default:
      return null
  }
}
