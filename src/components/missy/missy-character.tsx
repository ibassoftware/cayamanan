"use client"

// The full figure, for the two surfaces with room for her: the empty thread and the
// in-flight turn. `state` comes from `deriveMissyState` — she only ever acts out something
// that actually happened.
import { useId } from "react"

import { MissyDefs, MissyFullFigure } from "@/components/missy/missy-art"
import type { MissyState } from "@/lib/chat/missy-state"
import { cn } from "@/lib/utils"
import styles from "@/components/missy/missy.module.css"

/**
 * What the panel prints beside her while a turn is in flight. `null` means the surface next
 * to her already explains itself — the confirmation card holds its own Approve button, and
 * a failure renders an alert — so a second caption would just be noise.
 */
export const MISSY_STATE_CAPTION: Record<MissyState, string | null> = {
  idle: null,
  thinking: "Missy is thinking…",
  reading: "Looking that up…",
  working: "Working on it…",
  "awaiting-approval": null,
  concerned: null,
  celebrating: null,
}

export function MissyCharacter({ state, className }: { state: MissyState; className?: string }) {
  const uid = useId().replace(/:/g, "")

  return (
    <svg
      viewBox="20 20 300 270"
      className={cn(styles.figure, className)}
      data-state={state}
      aria-hidden="true"
      focusable="false"
    >
      <MissyDefs uid={uid} />
      <MissyFullFigure uid={uid} />
    </svg>
  )
}
