"use client"

import type { UIMessage } from "ai"
import { isDynamicToolUIPart, isToolUIPart } from "ai"

import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { ToolCallCard } from "@/components/chat/tool-call-card"


// Mastra injects its own memory tools when workingMemory is enabled. They carry no dot
// (they are not registry action ids), so matching on the exact names keeps this narrow —
// a future real action called e.g. `employee.updateWorkingMemory` would still render.
const INTERNAL_MEMORY_TOOLS = new Set(["updateWorkingMemory", "__updateWorkingMemory"])

function isInternalMemoryTool(part: { type: string }): boolean {
  const name = part.type.startsWith("tool-") ? part.type.slice("tool-".length) : part.type
  return INTERNAL_MEMORY_TOOLS.has(name)
}

export function ChatMessage({ message }: { message: UIMessage }) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <MessageResponse key={`${message.id}-part-${index}`}>{part.text}</MessageResponse>
            )
          }
          if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
            // Mastra's own working-memory bookkeeping is not one of our registered
            // actions and means nothing to an HR user — it surfaced as an
            // "updateWorkingMemory" card sitting next to real ones. Hidden, not disabled:
            // the memory write still happens, it just isn't narrated.
            if (isInternalMemoryTool(part)) return null
            return <ToolCallCard key={part.toolCallId} part={part} />
          }
          // Luna reasons before answering. With `reasoningSummary: 'auto'` set on the
          // agent, OpenAI returns a readable summary alongside the encrypted content —
          // but it is still often empty (a short turn may need no summary), so render
          // only when there is something to read. Collapsed: it is context, not the
          // answer, and the panel is for HR staff rather than prompt debugging.
          if (part.type === "reasoning" && part.text?.trim()) {
            return (
              <Reasoning key={`${message.id}-part-${index}`} className="w-full" isStreaming={false}>
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            )
          }
          return null
        })}
      </MessageContent>
    </Message>
  )
}
