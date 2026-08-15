'use client'

import '@/app/globals.css'
import { useEffect, useState } from 'react'
import { DefaultChatTransport, ToolUIPart } from 'ai'
import { useChat } from '@ai-sdk/react'

import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'

import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'

import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool'

function Chat() {
  const [input, setInput] = useState<string>('')

  const { messages, setMessages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  })

  useEffect(() => {
    const fetchMessages = async () => {
      const res = await fetch('/api/chat')
      const data = await res.json()
      setMessages([...data])
    }
    fetchMessages()
  }, [setMessages])

  const handleSubmit = async () => {
    if (!input.trim()) return

    sendMessage({ text: input })
    setInput('')
  }

  const isBusy = status !== 'ready'

  return (
    <div className="flex h-dvh w-full flex-col overflow-x-hidden bg-background">
      {/* App chrome. Page title is capped at 28px — this is an application
          surface, not a marketing hero (ui-principles §0.1). */}
      <header className="shrink-0 border-border border-b bg-card">
        <div className="mx-auto flex w-full max-w-[1152px] items-center justify-between gap-4 px-6 py-4">
          <h1 className="tc-app-title">Cayamanan Assistant</h1>
          <span className="hidden text-body-subtle text-sm sm:inline">
            Payroll &amp; people, answered
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-[1152px] flex-1 flex-col px-6">
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="gap-8 px-0 py-8">
              {messages.length === 0 && (
                <ConversationEmptyState>
                  <div className="tc-measure mx-auto text-center">
                    <h2>Ask about payroll, people or policy</h2>
                    <p className="text-body">
                      Start a conversation and the assistant will explain,
                      cross-check and point you at the right record. It never
                      computes a payroll amount on its own.
                    </p>
                  </div>
                </ConversationEmptyState>
              )}

              {messages.map(message => (
                <div key={message.id} className="flex flex-col gap-2">
                  {/* Persistent, non-colour cue for who is speaking (WCAG 1.4.1) */}
                  <span
                    className={
                      message.role === 'user'
                        ? 'block text-right font-medium text-body-subtle text-xs uppercase tracking-[0.1em]'
                        : 'block font-medium text-body-subtle text-xs uppercase tracking-[0.1em]'
                    }
                  >
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </span>

                  {message.parts?.map((part, i) => {
                    if (part.type === 'text') {
                      return (
                        <Message key={`${message.id}-${i}`} from={message.role}>
                          <MessageContent>
                            <MessageResponse className="tc-measure">
                              {part.text}
                            </MessageResponse>
                          </MessageContent>
                        </Message>
                      )
                    }

                    if (part.type?.startsWith('tool-')) {
                      return (
                        <Tool key={`${message.id}-${i}`}>
                          <ToolHeader
                            type={(part as ToolUIPart).type}
                            state={(part as ToolUIPart).state || 'output-available'}
                          />
                          <ToolContent>
                            <ToolInput input={(part as ToolUIPart).input || {}} />
                            <ToolOutput
                              output={(part as ToolUIPart).output}
                              errorText={(part as ToolUIPart).errorText}
                            />
                          </ToolContent>
                        </Tool>
                      )
                    }

                    return null
                  })}
                </div>
              ))}
              <ConversationScrollButton />
            </ConversationContent>
          </Conversation>

          <div className="shrink-0 pb-6">
            {/* Children sit directly under PromptInput. PromptInputBody renders a
                `display:contents` wrapper, which is still a DOM child, so it
                breaks InputGroup's `:has(> textarea)` / `:has(> [data-align])`
                rules and the field collapses to a 32px row. */}
            <PromptInput onSubmit={handleSubmit}>
              <PromptInputTextarea
                onChange={e => setInput(e.target.value)}
                value={input}
                placeholder="Ask about payroll, employees, leave or benefits…"
                disabled={isBusy}
              />
              <PromptInputFooter>
                <PromptInputTools className="min-w-0">
                  <span
                    aria-live="polite"
                    className="truncate text-body-subtle text-sm"
                  >
                    {isBusy ? 'Working…' : ''}
                  </span>
                  {/* Keyboard hint only means something with a physical
                      keyboard, and it crowds the submit button below 640px. */}
                  {!isBusy && (
                    <span className="hidden truncate text-body-subtle text-sm sm:inline">
                      Enter to send · Shift + Enter for a new line
                    </span>
                  )}
                </PromptInputTools>
                {/* 44x44 touch target (accessibility.md §10) */}
                <PromptInputSubmit
                  className="size-11 shrink-0 rounded-md"
                  disabled={!input.trim() || isBusy}
                  status={status}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Chat
