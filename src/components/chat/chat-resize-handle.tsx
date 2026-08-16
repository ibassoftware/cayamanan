"use client"

// The drag/keyboard handle for resizing Missy's docked chat panel — a WAI-ARIA "window
// splitter": a focusable separator exposing orientation + aria-valuenow/min/max
// (https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/). Pointer drag and arrow keys
// both go through the same clamp in `panel-width.ts` so the panel can never leave
// [MIN_PANEL_WIDTH, MAX_PANEL_WIDTH]. Desktop-only — the caller never mounts this below `lg`.
import { useEffect, useRef } from "react"

import {
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  nextPanelWidthForKey,
  nextPanelWidthForPointerDelta,
} from "@/lib/chat/panel-width"

interface ChatResizeHandleProps {
  width: number
  onWidthChange: (width: number) => void
}

export function ChatResizeHandle({ width, onWidthChange }: ChatResizeHandleProps) {
  // Mirrored into refs so the window-level listeners below (added once per drag, not
  // per render) always read the *current* width/callback rather than a stale closure
  // captured when the drag started.
  /* eslint-disable react-hooks/refs -- mirrored every render so the window listeners
     below (added once per drag, not per render) read the latest value/callback rather
     than a stale closure from the render that started the drag; never read during
     render itself. */
  const widthRef = useRef(width)
  widthRef.current = width
  const onWidthChangeRef = useRef(onWidthChange)
  onWidthChangeRef.current = onWidthChange
  /* eslint-enable react-hooks/refs */
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Stable function identities (created once, referenced by `.current` below) so
  // add/removeEventListener always target the same reference.
  const handlePointerMoveRef = useRef((event: PointerEvent) => {
    const drag = dragStartRef.current
    if (!drag) return
    onWidthChangeRef.current(nextPanelWidthForPointerDelta(drag.startWidth, event.clientX - drag.startX))
  })
  const endDragRef = useRef(() => {
    dragStartRef.current = null
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    window.removeEventListener("pointermove", handlePointerMoveRef.current)
    window.removeEventListener("pointerup", endDragRef.current)
  })

  // Belt-and-braces: if the handle unmounts mid-drag (e.g. collapsing the panel),
  // don't leave a dangling window listener or a stuck resize cursor behind.
  useEffect(() => {
    // Copied locally: these refs are stable function identities set once at creation
    // and never reassigned, but the cleanup below needs its own snapshot regardless.
    const handlePointerMove = handlePointerMoveRef.current
    const endDrag = endDragRef.current
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", endDrag)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragStartRef.current = { startX: event.clientX, startWidth: widthRef.current }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", handlePointerMoveRef.current)
    window.addEventListener("pointerup", endDragRef.current)
    event.preventDefault()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = nextPanelWidthForKey(widthRef.current, event.key)
    if (next === null) return
    event.preventDefault()
    onWidthChangeRef.current(next)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Missy panel width"
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuemax={MAX_PANEL_WIDTH}
      aria-valuetext={`${Math.round(width)} pixels`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className="group flex w-6 shrink-0 cursor-col-resize touch-none select-none items-center justify-center"
    >
      <span
        aria-hidden="true"
        className="h-full w-1 rounded-full bg-border-control transition-colors group-hover:bg-brand group-focus-visible:bg-brand-strong"
      />
    </div>
  )
}
