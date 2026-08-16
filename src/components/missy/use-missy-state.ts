"use client"

// Wraps the pure `deriveMissyState` with the two states that need a clock, which is why
// they are not in the pure function: the celebration when a turn completes, and the decay
// of a failure once the turn has settled.
import type { ChatStatus } from "ai"
import { useEffect, useState } from "react"

import { deriveMissyState, type MissyState } from "@/lib/chat/missy-state"

const TRANSIENT_MS = 2000

interface AssistantMessageLike {
  role: string
  parts: Array<{ type: string; state?: string; output?: unknown; toolName?: string }>
}

/** What a finished turn leaves her doing, or `null` for "nothing to play". */
function endOfTurnPose(derived: MissyState): MissyState | null {
  // A pending approval is not a finish — she holds the presenting pose until the user
  // resolves the card, so there is nothing to play over the top of it.
  if (derived === "awaiting-approval") return null
  return derived === "concerned" ? "concerned" : "celebrating"
}

export function useMissyState(
  status: ChatStatus,
  lastMessage: AssistantMessageLike | undefined,
): MissyState {
  const derived = deriveMissyState(status, lastMessage)
  const [transient, setTransient] = useState<MissyState | null>(null)

  // Adjusting state during render rather than in an effect — the same pattern (and the same
  // reason) as the pathname reset in src/lib/screen-context.tsx. A transient pose is a
  // reaction to a status *transition*, so it is derived from the change itself; routing it
  // through an effect would cost an extra committed render and trip
  // react-hooks/set-state-in-effect.
  const [lastStatus, setLastStatus] = useState<ChatStatus | null>(null)
  if (status !== lastStatus) {
    const turnJustEnded = status === "ready" && (lastStatus === "streaming" || lastStatus === "submitted")
    setLastStatus(status)
    // A new turn cancels whatever the last one ended on.
    if (status === "submitted" || status === "streaming") setTransient(null)
    else if (turnJustEnded) setTransient(endOfTurnPose(derived))
  }

  // The clock half. setState here is inside a timer callback, not the effect body.
  useEffect(() => {
    if (!transient) return
    const timer = setTimeout(() => setTransient(null), TRANSIENT_MS)
    return () => clearTimeout(timer)
  }, [transient])

  if (transient) return transient

  // Once the failure has been acknowledged she goes back to waiting rather than sulking at
  // the user indefinitely. The error alert and the failed tool card both stay on screen —
  // her expression is not what carries that information.
  if (status === "ready" && derived === "concerned") return "idle"

  return derived
}
