import { MessageCircle } from "lucide-react"

/**
 * Right-hand chat slot — placeholder only.
 * Slice 03 (Missy Foundation) mounts the real persistent chat panel here.
 */
export function ChatSlot() {
  return (
    <aside
      aria-label="Assistant (coming soon)"
      className="flex shrink-0 flex-col items-center justify-center gap-2 border-border border-t bg-card px-6 py-10 text-center lg:w-80 lg:border-t-0 lg:border-l lg:py-0"
    >
      <MessageCircle
        className="size-6 text-body-subtle"
        aria-hidden="true"
      />
      <p className="font-medium text-heading text-sm">Missy</p>
      <p className="tc-measure text-body-subtle text-sm">
        The assistant panel lands in a later slice. This space is reserved for
        it on every screen.
      </p>
    </aside>
  )
}
