import { describe, expect, it } from 'vitest';
import type { MastraDBMessage } from '@mastra/core/agent/message-list';

import { reasoningReplayGuard } from '@/mastra/processors/reasoning-replay-guard';

// Regression test for the known Mastra/OpenAI Responses API landmine (mastra-ai/mastra#9005):
// "Item 'msg_…' of type 'message' was provided without its required 'reasoning' item" — a
// replayed assistant message that still carries a `reasoning` part can 400 the whole
// turn if that item's linkage didn't survive the recall round-trip. The fix strips
// `reasoning` parts from every message at the start of every generate()/stream() call
// (before this call's own turn has produced anything), so a stale/incomplete reasoning
// item is never re-asserted.
function assistantMessage(parts: MastraDBMessage['content']['parts']): MastraDBMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    createdAt: new Date(),
    content: { format: 2, parts },
  };
}

describe('reasoningReplayGuard', () => {
  it('strips reasoning parts from recalled assistant messages', () => {
    const message = assistantMessage([
      { type: 'reasoning', text: 'internal scratch reasoning', providerMetadata: { openai: { itemId: 'rs_123' } } },
      { type: 'text', text: 'Here is my answer.' },
    ] as MastraDBMessage['content']['parts']);

    const result = reasoningReplayGuard.processInput!({
      messages: [message],
    } as Parameters<NonNullable<typeof reasoningReplayGuard.processInput>>[0]);

    const output = Array.isArray(result) ? result : [];
    expect(output).toHaveLength(1);
    const parts = output[0]!.content.parts;
    expect(parts.some((p) => p.type === 'reasoning')).toBe(false);
    expect(parts.some((p) => p.type === 'text')).toBe(true);
  });

  it('also strips the OpenAI response item-id linkage from surviving parts (not just reasoning parts)', () => {
    // Reproduces the case that still crashed with reasoning-part stripping alone: the
    // surviving `message`/text part itself carries `providerMetadata.openai.itemId`,
    // which is what ties it to a specific prior response chain.
    const message = assistantMessage([
      { type: 'reasoning', text: 'internal scratch reasoning', providerMetadata: { openai: { itemId: 'rs_123' } } },
      { type: 'text', text: 'Here is my answer.', providerMetadata: { openai: { itemId: 'msg_456' } } },
    ] as MastraDBMessage['content']['parts']);

    const result = reasoningReplayGuard.processInput!({
      messages: [message],
    } as Parameters<NonNullable<typeof reasoningReplayGuard.processInput>>[0]);

    const output = Array.isArray(result) ? result : [];
    const textPart = output[0]!.content.parts.find((p) => p.type === 'text') as { providerMetadata?: unknown };
    expect(textPart.providerMetadata).toBeUndefined();
  });

  it('leaves user messages and reasoning-free assistant messages untouched', () => {
    const userMessage: MastraDBMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      createdAt: new Date(),
      content: { format: 2, parts: [{ type: 'text', text: 'hello' }] as MastraDBMessage['content']['parts'] },
    };
    const plainAssistant = assistantMessage([{ type: 'text', text: 'hi there' }] as MastraDBMessage['content']['parts']);

    const result = reasoningReplayGuard.processInput!({
      messages: [userMessage, plainAssistant],
    } as Parameters<NonNullable<typeof reasoningReplayGuard.processInput>>[0]);

    const output = Array.isArray(result) ? result : [];
    expect(output).toEqual([userMessage, plainAssistant]);
  });
});
