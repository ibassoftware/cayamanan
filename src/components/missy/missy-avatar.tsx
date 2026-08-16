"use client"

// Missy's head, for the app chrome: panel header, assistant messages, the collapsed rail
// and the mobile launcher. Decorative in every placement, so it is `aria-hidden` and each
// caller supplies its own accessible label.
//
// `state` is accepted but usually left at rest: the crop shows only her face, so the poses
// that live in her arms and props do nothing here. The one that reads at this size is
// `awaiting-approval`, whose raised brow is what the confirmation card wants.
import { useId } from "react"

import { MissyDefs, MissyHead } from "@/components/missy/missy-art"
import type { MissyState } from "@/lib/chat/missy-state"
import { cn } from "@/lib/utils"
import styles from "@/components/missy/missy.module.css"

export function MissyAvatar({ className, state = "idle" }: { className?: string; state?: MissyState }) {
  // `useId` contains colons, which are legal in an id but awkward inside `url(#…)`.
  const uid = useId().replace(/:/g, "")

  return (
    <svg
      viewBox="113 15 114 156"
      className={cn(styles.figure, className)}
      data-state={state}
      aria-hidden="true"
      focusable="false"
    >
      <MissyDefs uid={uid} />
      <MissyHead uid={uid} />
    </svg>
  )
}
