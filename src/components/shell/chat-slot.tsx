import { ChatPanel } from "@/components/chat/chat-panel"

/**
 * Right-hand chat slot — mounts the real Missy chat panel (slice 03, Missy Foundation).
 * The conversation itself lives in `ChatProvider`, mounted higher up in the app shell
 * layout so it survives client-side navigation between `/app/*` screens; this component
 * only renders the panel UI.
 */
export function ChatSlot() {
  return <ChatPanel />
}
