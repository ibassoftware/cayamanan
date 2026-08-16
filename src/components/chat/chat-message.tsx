"use client"

import type { UIMessage } from "ai"
import { isDynamicToolUIPart, isToolUIPart } from "ai"

import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { ToolCallCard } from "@/components/chat/tool-call-card"

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
            return <ToolCallCard key={part.toolCallId} part={part} />
          }
          return null
        })}
      </MessageContent>
    </Message>
  )
}
