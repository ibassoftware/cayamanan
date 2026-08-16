"use client"

// The chat panel itself (03-missy-foundation.md UI screens table). Desktop docks it as a
// right-hand column, always in the layout (collapsed = a slim toggle bar, never removed
// from the flex row so the main content doesn't reflow). Below the `lg` breakpoint it's a
// fixed overlay instead — docking a 320px+ column next to page content at 375px would
// force horizontal scroll, so the mobile behaviour is a floating toggle button that opens
// a full-screen sheet, escaping normal document flow entirely.
import { AlertTriangleIcon, XIcon } from "lucide-react"
import type { ChatStatus } from "ai"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { deriveAnnouncement, extractMessageText } from "@/lib/chat/announcer"
import { ChatMessage } from "@/components/chat/chat-message"
import { isVisibleOutputPart } from "@/lib/chat/internal-tools"
import { ChatResizeHandle } from "@/components/chat/chat-resize-handle"
import { ThreadList } from "@/components/chat/thread-list"
import { useMissyChat } from "@/components/chat/chat-provider"
import { ChatAttachmentControl } from "@/components/chat/chat-attachment-control"
import type { AttachmentSlot } from "@/components/chat/chat-attachment-state"
import { MissyAvatar } from "@/components/missy/missy-avatar"
import { MISSY_STATE_CAPTION, MissyCharacter } from "@/components/missy/missy-character"
import { useMissyState } from "@/components/missy/use-missy-state"
import { DEFAULT_PANEL_WIDTH, getPersistedPanelWidth, setPersistedPanelWidth, type SimpleStorage } from "@/lib/chat/panel-width"

function browserStorage(): SimpleStorage | null {
  if (typeof window === "undefined") return null
  return window.localStorage
}

/** True when the panel docks as a column rather than covering the screen as a drawer. */
function isDockedWidth(): boolean {
  if (typeof window === "undefined") return true
  return window.matchMedia("(min-width: 1024px)").matches
}

export function ChatPanel() {
  const { collapsed, setCollapsed } = useMissyChat()
  const pathname = usePathname()

  // In drawer mode the panel covers the page, so staying open across a navigation would
  // land the user on a screen they cannot see — including when Missy navigates for them
  // via `ui.navigate`. Docked mode is untouched: there the whole point is that the
  // conversation survives navigation.
  //
  // Adjusted during render rather than in an effect, the same pattern as
  // src/lib/screen-context.tsx, so it costs no extra committed render.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    if (!collapsed && !isDockedWidth()) setCollapsed(true)
  }
  // Starts at the previous fixed width so server + first client render match (no
  // localStorage during SSR); the effect below then restores whatever was persisted.
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)

  // On mount only: reopen the persisted width, past a microtask boundary so no state
  // setter fires synchronously within the effect itself (same pattern as the thread-id
  // restore in chat-provider.tsx).
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      const storage = browserStorage()
      if (storage) setPanelWidth(getPersistedPanelWidth(storage))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleWidthChange = useCallback((next: number) => {
    setPanelWidth(next)
    const storage = browserStorage()
    if (storage) setPersistedPanelWidth(storage, next)
  }, [])

  return (
    <>
      <aside
        aria-label="Missy assistant"
        className={cn(
          "hidden shrink-0 bg-card lg:flex",
          collapsed ? "flex-col border-border border-l lg:w-14" : "flex-row",
        )}
        style={collapsed ? undefined : { width: panelWidth }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setCollapsed(true)
        }}
      >
        {collapsed ? (
          <div className="flex flex-1 flex-col items-center pt-4">
            {/* The panel starts collapsed, so this is the first thing anyone sees of Missy —
                a face rather than a chat glyph is the whole point of the slice. */}
            <Button type="button" variant="ghost" size="icon" aria-label="Open Missy" onClick={() => setCollapsed(false)}>
              <MissyAvatar className="size-7" />
            </Button>
          </div>
        ) : (
          <>
            <ChatResizeHandle width={panelWidth} onWidthChange={handleWidthChange} />
            <div className="flex min-w-0 flex-1 flex-col">
              <ChatPanelContent onCollapse={() => setCollapsed(true)} />
            </div>
          </>
        )}
      </aside>

      <div className="lg:hidden">
        {collapsed ? (
          <Button
            type="button"
            aria-label="Open Missy"
            variant="outline"
            className="fixed right-4 bottom-4 z-40 size-14 overflow-hidden rounded-full bg-card p-0 shadow-lg"
            onClick={() => setCollapsed(false)}
          >
            <MissyAvatar className="size-10" />
          </Button>
        ) : (
          <>
            {/* Below `lg` the panel is an overlay, and it used to be `fixed inset-0` with
                nothing behind it: it silently swallowed every click meant for the sidebar,
                so on a window narrower than 1024px "click All employees" appeared to do
                nothing at all. It is a drawer with a real backdrop now — the app stays
                visible behind it, and clicking out of it dismisses rather than absorbing
                the click. */}
            <button
              type="button"
              aria-label="Close Missy"
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default bg-heading/25"
              onClick={() => setCollapsed(true)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Missy assistant"
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-2xl"
              onKeyDown={(event) => {
                if (event.key === "Escape") setCollapsed(true)
              }}
            >
              <ChatPanelContent onCollapse={() => setCollapsed(true)} />
            </div>
          </>
        )}
      </div>
    </>
  )
}

function ChatPanelContent({ onCollapse }: { onCollapse: () => void }) {
  const { messages, status, error, sendMessage, retry, stop, historyState } = useMissyChat()
  const [announcement, setAnnouncement] = useState("")
  const previousStatusRef = useRef<ChatStatus | null>(null)
  const [attachmentSlot, setAttachmentSlot] = useState<AttachmentSlot>({ status: "idle" })

  // "In flight, but the assistant has produced nothing visible yet" — either the request
  // is still submitted, or it is streaming a turn whose only parts so far are reasoning
  // (which renders as nothing, see below).
  const lastMessage = messages[messages.length - 1]
  const assistantHasVisibleOutput =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(isVisibleOutputPart)
  const isAwaitingFirstOutput =
    status === "submitted" || (status === "streaming" && !assistantHasVisibleOutput)

  // Which pose she holds. Derived from parts that have already streamed back, so this
  // reflects the turn rather than predicting it.
  const missyState = useMissyState(status, lastMessage)
  const isTurnInFlight = status === "submitted" || status === "streaming"

  // She stays on screen for the whole turn, but the caption only appears when it is telling
  // the user something the transcript is not: before anything has rendered, or while a tool
  // is running. Once text is streaming, the text is the status.
  const showMissyAtWork = isTurnInFlight || missyState === "celebrating"
  const caption =
    isAwaitingFirstOutput || missyState === "reading" || missyState === "working"
      ? MISSY_STATE_CAPTION[missyState]
      : null

  // One polite announcement per turn (submitted -> streaming -> ready), never per token —
  // see src/lib/chat/announcer.ts for why.
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    const lastAssistantText = lastMessage?.role === "assistant" ? extractMessageText(lastMessage) : ""
    const next = deriveAnnouncement(previousStatusRef.current, status, lastAssistantText)
    previousStatusRef.current = status
    if (next) setAnnouncement(next)
  }, [status, messages])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-border border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MissyAvatar className="size-6" />
          <p className="font-medium text-heading text-sm">Missy</p>
        </div>
        <div className="flex items-center gap-1">
          <ThreadList />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Collapse Missy" onClick={onCollapse}>
            <XIcon className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* A single polite announcement per turn — see the effect above. */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {historyState.status === "loading" && (
            <div className="flex items-center justify-center gap-2 py-8 text-body-subtle text-sm">
              <Spinner />
              Loading conversation…
            </div>
          )}

          {historyState.status === "error" && (
            <div className="mx-auto max-w-xs py-8 text-center text-fg-danger text-sm">{historyState.message}</div>
          )}

          {historyState.status === "ready" && messages.length === 0 && (
            <ConversationEmptyState
              icon={<MissyCharacter state="idle" className="h-40" />}
              title="Ask Missy anything"
              description="She can look things up, navigate the app, and — with your approval — make changes on your behalf."
            />
          )}

          {historyState.status === "ready" &&
            messages.map((message) => <ChatMessage key={message.id} message={message} />)}

          {/* Luna is a reasoning model: it thinks before emitting any text, and OpenAI
              returns that reasoning encrypted (`reasoningEncryptedContent`) with an empty
              text body — so there is genuinely nothing to render for it. Without this the
              panel just sits still for several seconds and looks broken.
              `aria-hidden` on purpose: the polite region above already announces exactly one
              status per turn, and mirroring every pose change into a live region would spam
              assistive tech with the thing that fix was written to avoid. */}
          {historyState.status === "ready" && showMissyAtWork && (
            <div className="flex items-center gap-2 py-1" aria-hidden="true">
              <MissyCharacter state={missyState} className="h-16 shrink-0" />
              {caption && <span className="text-body-subtle text-sm">{caption}</span>}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <div className="shrink-0 border-border border-t px-3 pt-3">
          <Alert variant="destructive" role="alert">
            <AlertTriangleIcon className="size-4" aria-hidden="true" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>{error.message || "Something went wrong. Please try again."}</span>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="shrink-0 space-y-2 border-border border-t p-3">
        <ChatAttachmentControl slot={attachmentSlot} onSlotChange={setAttachmentSlot} disabled={isTurnInFlight} />
        <PromptInput
          onSubmit={(message) => {
            const attachment = attachmentSlot.status === "ready" ? attachmentSlot : null
            sendMessage(
              message.text,
              attachment ? { id: attachment.id, filename: attachment.filename, rowCount: attachment.rowCount } : undefined,
            )
            // Cleared immediately, the same optimistic timing as the textarea itself
            // (PromptInput clears its own text synchronously on submit) — the message
            // has already been handed to sendMessage by this point.
            setAttachmentSlot({ status: "idle" })
          }}
        >
          <PromptInputTextarea placeholder="Ask Missy…" />
          <PromptInputFooter>
            <span className="text-body-subtle text-xs">Enter to send · Shift+Enter for a new line</span>
            <PromptInputSubmit status={status} onStop={stop} disabled={attachmentSlot.status === "uploading"} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
