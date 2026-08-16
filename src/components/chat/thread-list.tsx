"use client"

// Thread list UI (03-missy-foundation.md "Thread list" surface: "recent threads, new
// thread"). Reuses the existing dropdown-menu primitive rather than building a bespoke
// popover.
import { HistoryIcon, PlusIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMissyChat } from "@/components/chat/chat-provider"

export function ThreadList() {
  const { threadsState, threadId, selectThread, startNewThread } = useMissyChat()

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => void startNewThread()} aria-label="Start a new conversation">
        <PlusIcon className="size-4" aria-hidden="true" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Recent conversations">
              <HistoryIcon className="size-4" aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Recent conversations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {threadsState.status === "loading" && (
            <div className="flex items-center gap-2 px-1.5 py-2 text-body-subtle text-sm">
              <Spinner className="size-3.5" />
              Loading…
            </div>
          )}
          {threadsState.status === "error" && (
            <div className="px-1.5 py-2 text-fg-danger text-sm">{threadsState.message}</div>
          )}
          {threadsState.status === "ready" && threadsState.threads.length === 0 && (
            <div className="px-1.5 py-2 text-body-subtle text-sm">No conversations yet.</div>
          )}
          {threadsState.status === "ready" &&
            threadsState.threads.map((thread) => (
              <DropdownMenuItem
                key={thread.id}
                onClick={() => void selectThread(thread.id)}
                data-active={thread.id === threadId}
                className="data-[active=true]:bg-accent"
              >
                <span className="truncate">{thread.title}</span>
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
