"use client"

// The chat panel itself (03-missy-foundation.md UI screens table). Desktop docks it as a
// right-hand column, always in the layout (collapsed = a slim toggle bar, never removed
// from the flex row so the main content doesn't reflow). Below the `lg` breakpoint it's a
// fixed overlay instead — docking a 320px+ column next to page content at 375px would
// force horizontal scroll, so the mobile behaviour is a floating toggle button that opens
// a full-screen sheet, escaping normal document flow entirely.
import { AlertTriangleIcon, MessageCircleIcon, XIcon } from "lucide-react"
import type { ChatStatus } from "ai"
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
import { DEFAULT_PANEL_WIDTH, getPersistedPanelWidth, setPersistedPanelWidth, type SimpleStorage } from "@/lib/chat/panel-width"

function browserStorage(): SimpleStorage | null {
  if (typeof window === "undefined") return null
  return window.localStorage
}

export function ChatPanel() {
  const { collapsed, setCollapsed } = useMissyChat()
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
            <Button type="button" variant="ghost" size="icon" aria-label="Open Missy" onClick={() => setCollapsed(false)}>
              <MessageCircleIcon className="size-5" aria-hidden="true" />
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
            className="fixed right-4 bottom-4 z-40 size-14 rounded-full shadow-lg"
            onClick={() => setCollapsed(false)}
          >
            <MessageCircleIcon className="size-6" aria-hidden="true" />
          </Button>
        ) : (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Missy assistant"
            className="fixed inset-0 z-50 flex flex-col bg-card"
            onKeyDown={(event) => {
              if (event.key === "Escape") setCollapsed(true)
            }}
          >
            <ChatPanelContent onCollapse={() => setCollapsed(true)} />
          </div>
        )}
      </div>
    </>
  )
}

function ChatPanelContent({ onCollapse }: { onCollapse: () => void }) {
  const { messages, status, error, sendMessage, retry, stop, historyState } = useMissyChat()
  const [announcement, setAnnouncement] = useState("")
  const previousStatusRef = useRef<ChatStatus | null>(null)

  // "In flight, but the assistant has produced nothing visible yet" — either the request
  // is still submitted, or it is streaming a turn whose only parts so far are reasoning
  // (which renders as nothing, see below).
  const lastMessage = messages[messages.length - 1]
  const assistantHasVisibleOutput =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(isVisibleOutputPart)
  const isAwaitingFirstOutput =
    status === "submitted" || (status === "streaming" && !assistantHasVisibleOutput)

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
          <MessageCircleIcon className="size-5 text-brand-strong" aria-hidden="true" />
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
              icon={<MessageCircleIcon className="size-8" aria-hidden="true" />}
              title="Ask Missy anything"
              description="She can look things up, navigate the app, and — with your approval — make changes on your behalf."
            />
          )}

          {historyState.status === "ready" &&
            messages.map((message) => <ChatMessage key={message.id} message={message} />)}

          {/* Luna is a reasoning model: it thinks before emitting any text, and OpenAI
              returns that reasoning encrypted (`reasoningEncryptedContent`) with an empty
              text body — so there is genuinely nothing to render for it. Without this the
              panel just sits still for several seconds and looks broken. Shown while the
              turn is in flight but nothing visible has arrived yet. */}
          {historyState.status === "ready" && isAwaitingFirstOutput && (
            <div className="flex items-center gap-2 py-1 text-body-subtle text-sm" aria-live="polite">
              <Spinner />
              <span>Missy is thinking…</span>
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

      <div className="shrink-0 border-border border-t p-3">
        <PromptInput onSubmit={(message) => sendMessage(message.text)}>
          <PromptInputTextarea placeholder="Ask Missy…" />
          <PromptInputFooter>
            <span className="text-body-subtle text-xs">Enter to send · Shift+Enter for a new line</span>
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
