"use client"

// The chat panel's conversation state, lifted into a provider mounted once in the app
// shell layout (03-missy-foundation.md criterion 1: "keeps its conversation while you
// navigate" — state in a provider, not per-page). Talks to the two endpoints the backend
// slice already ships: `POST /api/chat` (streaming) and `GET /api/chat?threadId=` (history
// on reload), plus `ai.listThreads`/`ai.createThread` via the existing action route.
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type ChatStatus, type UIMessage } from "ai"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { callAction } from "@/lib/actions-client"
import { useScreenContext, type ScreenContext } from "@/lib/screen-context"
import {
  clearPersistedThreadId,
  getPersistedThreadId,
  setPersistedThreadId,
  type SimpleStorage,
} from "@/lib/chat/thread-storage"

export interface MissyThreadSummary {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string
}

export type ThreadsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; threads: MissyThreadSummary[] }

export type HistoryState = { status: "loading" | "ready" } | { status: "error"; message: string }

interface ChatContextValue {
  messages: UIMessage[]
  status: ChatStatus
  error: Error | undefined
  sendMessage: (text: string) => void
  retry: () => void
  stop: () => void
  threadId: string | null
  threadsState: ThreadsState
  refreshThreads: () => void
  startNewThread: () => Promise<void>
  selectThread: (id: string) => Promise<void>
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  historyState: HistoryState
}

const ChatContext = createContext<ChatContextValue | null>(null)

function browserStorage(): SimpleStorage | null {
  if (typeof window === "undefined") return null
  return window.localStorage
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const screenContext = useScreenContext()
  // Synced via effect (never mutated during render itself) so `sendMessage` — called
  // later, from an event handler — can read the *current* screen context without making
  // the callback (and everything memoized against it) change identity on every navigation.
  const screenContextRef = useRef<ScreenContext>(screenContext)
  useEffect(() => {
    screenContextRef.current = screenContext
  }, [screenContext])

  // Starts collapsed: an assistant panel covering content by default (especially the
  // full-screen mobile sheet, see chat-panel.tsx) would be intrusive on first load.
  const [collapsed, setCollapsed] = useState(true)
  const [threadId, setThreadIdState] = useState<string | null>(null)
  // Mirrors `threadId` for the transport's closures below, which must read the *current*
  // thread id at request time without the transport itself changing identity (that would
  // make useChat rebuild its internal Chat instance mid-conversation). Only ever mutated
  // from callbacks that run outside render (the fetch wrapper, persistThreadId,
  // clearThreadState) — never read or written during render itself.
  const threadIdRef = useRef<string | null>(null)
  const [historyState, setHistoryState] = useState<HistoryState>({ status: "loading" })
  const [threadsState, setThreadsState] = useState<ThreadsState>({ status: "loading" })

  const persistThreadId = useCallback((id: string) => {
    threadIdRef.current = id
    setThreadIdState(id)
    const storage = browserStorage()
    if (storage) setPersistedThreadId(storage, id)
  }, [])

  // Built once: `body`/`fetch` close over `threadIdRef` above rather than per-render
  // state, so the transport instance itself never needs to change identity. The ref is
  // only ever dereferenced later, when the transport actually makes a request (well after
  // this one construction render) — the lint rule's static analysis can't see that a ref
  // merely captured in a closure here is never read until invoked later, hence the
  // block-scoped disable below.
  /* eslint-disable react-hooks/refs -- closures below only read/write the ref when actually invoked by a request, never during this construction render */
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ threadId: threadIdRef.current ?? undefined }),
        fetch: (async (input, init) => {
          const response = await fetch(input, init)
          // The UI contract for "which thread did this land in" (src/app/api/chat/route.ts)
          // — load-bearing the first time a conversation has no thread yet.
          const headerThreadId = response.headers.get("X-Missy-Thread-Id")
          if (headerThreadId && headerThreadId !== threadIdRef.current) {
            threadIdRef.current = headerThreadId
            setThreadIdState(headerThreadId)
            const storage = browserStorage()
            if (storage) setPersistedThreadId(storage, headerThreadId)
          }
          return response
        }) as typeof fetch,
      }),
  )
  /* eslint-enable react-hooks/refs */

  const refreshThreads = useCallback(() => {
    setThreadsState({ status: "loading" })
    callAction<{ threads: MissyThreadSummary[] }>("ai.listThreads").then((result) => {
      if (!result.ok) {
        setThreadsState({ status: "error", message: result.error.message })
        return
      }
      setThreadsState({ status: "ready", threads: result.data.threads })
    })
  }, [])

  const {
    messages,
    status,
    error,
    sendMessage: sendChatMessage,
    regenerate,
    stop,
    setMessages,
    clearError,
  } = useChat({
    transport,
    onFinish: () => {
      refreshThreads()
    },
  })

  const clearThreadState = useCallback(() => {
    threadIdRef.current = null
    setThreadIdState(null)
    const storage = browserStorage()
    if (storage) clearPersistedThreadId(storage)
    setMessages([])
  }, [setMessages])

  const loadHistory = useCallback(
    async (id: string) => {
      setHistoryState({ status: "loading" })
      try {
        const response = await fetch(`/api/chat?threadId=${encodeURIComponent(id)}`)
        if (response.status === 404) {
          // Not found, or belongs to someone else (getOwnedThread folds both into 404) —
          // start clean rather than getting the panel stuck on a conversation that will
          // never load.
          clearThreadState()
          setHistoryState({ status: "ready" })
          return
        }
        if (response.status === 401) {
          setHistoryState({ status: "error", message: "Your session has expired. Please sign in again." })
          return
        }
        if (!response.ok) {
          setHistoryState({ status: "error", message: "Couldn't load this conversation. Please try again." })
          return
        }
        const uiMessages = (await response.json()) as UIMessage[]
        persistThreadId(id)
        setMessages(uiMessages)
        setHistoryState({ status: "ready" })
      } catch {
        setHistoryState({
          status: "error",
          message: "Could not reach the server. Check your connection and try again.",
        })
      }
    },
    [clearThreadState, persistThreadId, setMessages],
  )

  // On mount only: reopen the persisted thread (if any) so a full page reload restores
  // history (criterion 1). Everything runs past a microtask boundary so no state setter
  // fires synchronously within the effect itself.
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      const storage = browserStorage()
      const persisted = storage ? getPersistedThreadId(storage) : null
      if (persisted) {
        await loadHistory(persisted)
      } else {
        setHistoryState({ status: "ready" })
      }
      if (!cancelled) refreshThreads()
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, [])

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      clearError()
      void sendChatMessage({ text: trimmed, metadata: screenContextRef.current })
    },
    [sendChatMessage, clearError],
  )

  const retry = useCallback(() => {
    clearError()
    void regenerate()
  }, [regenerate, clearError])

  const startNewThread = useCallback(async () => {
    const result = await callAction<{ id: string; title: string; createdAt: string; lastMessageAt: string }>(
      "ai.createThread",
    )
    if (!result.ok) {
      setHistoryState({ status: "error", message: result.error.message })
      return
    }
    persistThreadId(result.data.id)
    setMessages([])
    setHistoryState({ status: "ready" })
    refreshThreads()
  }, [persistThreadId, setMessages, refreshThreads])

  const selectThread = useCallback(
    async (id: string) => {
      if (id === threadIdRef.current) return
      await loadHistory(id)
    },
    [loadHistory],
  )

  const value = useMemo<ChatContextValue>(
    () => ({
      messages,
      status,
      error,
      sendMessage,
      retry,
      stop,
      threadId,
      threadsState,
      refreshThreads,
      startNewThread,
      selectThread,
      collapsed,
      setCollapsed,
      historyState,
    }),
    [
      messages,
      status,
      error,
      sendMessage,
      retry,
      stop,
      threadId,
      threadsState,
      refreshThreads,
      startNewThread,
      selectThread,
      collapsed,
      historyState,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useMissyChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error("useMissyChat must be used within a ChatProvider")
  return ctx
}
