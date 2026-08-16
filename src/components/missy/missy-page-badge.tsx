"use client"

/**
 * Surfaces a capability that is real but invisible: every message already carries the
 * screen context published by `ScreenContextProvider`, so Missy genuinely knows which page
 * you are on — but nothing in the UI ever said so.
 *
 * Deliberately claims only that, and not what she can *do* here. Tool exposure is resolved
 * per request from the caller's roles, so a badge promising actions would be guessing, and
 * the honest version of that promise is the `FORBIDDEN` she already returns.
 *
 * Hidden while the panel is open — she is on screen at that point, and saying she can see
 * the page next to a Missy who is visibly right there is noise.
 */
import { useMissyChat } from "@/components/chat/chat-provider"
import { MissyAvatar } from "@/components/missy/missy-avatar"
import { useScreenContext } from "@/lib/screen-context"

export function MissyPageBadge() {
  const { collapsed, setCollapsed } = useMissyChat()
  const { route } = useScreenContext()

  if (!collapsed) return null

  return (
    <button
      type="button"
      onClick={() => setCollapsed(false)}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background py-1 pr-3 pl-1 text-body-subtle text-xs transition-colors hover:border-brand hover:text-brand-strong"
      // The route is the honest description of what she can see, and it is already what
      // gets published with the message.
      aria-label={`Open Missy. She can see this page (${route}).`}
    >
      <MissyAvatar className="size-5" />
      <span className="hidden sm:inline">Missy can see this page</span>
      <span className="sm:hidden">Ask Missy</span>
    </button>
  )
}
