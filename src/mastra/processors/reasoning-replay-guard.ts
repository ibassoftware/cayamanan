// Workaround for a known Mastra/OpenAI Responses API interaction
// (mastra-ai/mastra#9005 — "OpenAI reasoning items filtering"; the dev-log symptom this
// slice was asked to investigate:
//   Item 'msg_…' of type 'message' was provided without its required 'reasoning' item: 'rs_…'
//
// What's happening: `gpt-5.6-luna` (a reasoning model, called via OpenAI's Responses API)
// produces a `reasoning` item alongside the `message`/tool-call item(s) in the same turn.
// Mastra's memory recall replays *prior, already-completed* turns as full conversation
// history for a brand-new `generate()`/`stream()` call (exactly the reload-and-continue
// path acceptance criterion 1 exercises). If a recalled assistant message still carries
// its `reasoning` part (with the provider's `itemId` in `providerMetadata`) but that
// item's own follow-through was dropped somewhere in the recall/round-trip path, the
// Responses API rejects the request outright — the *entire* turn 400s, not just a
// warning, because a `message` item that structurally depends on a `reasoning` item can't
// be replayed without it.
//
// IMPORTANT — this turned out to need two things, not one; dropping `reasoning` parts
// alone (the first attempt) still reproduced the crash intermittently:
//
//   1. Drop every `reasoning` part from a recalled/replayed message — the model doesn't
//      need to "see" its own prior internal reasoning text on a later turn anyway.
//   2. Strip the OpenAI Responses item-id linkage (`providerMetadata.openai.itemId`,
//      surfaced via @mastra/core's own `getOpenAIReasoningItemId`/exported provider-compat
//      helpers) from the *surviving* parts too — a `message` part can still carry the
//      itemId that ties it to a specific prior response, and the API's "this message
//      requires its reasoning item" validation is keyed off *that* id being present, not
//      merely off whether a `reasoning` part happens to still be in the array. Leaving it
//      on the message part while the paired reasoning part is gone is exactly what
//      reproduced "Item 'msg_…' was provided without its required 'reasoning' item"
//      even with fix (1) alone in place.
//
// The `inputProcessor`'s `processInput` hook runs exactly once, at the very start of
// every `generate()`/`stream()` call (per @mastra/core's own documented contract — see
// node_modules/@mastra/core/dist/processors/index.d.ts, "Unlike processInputStep ... this
// runs once at the start"). At that point every message in the batch is either recalled
// history or the new user message — nothing from *this* call's own turn has been produced
// yet, so it is always safe to strip both of the above here: no in-flight (same-call)
// tool-loop step is ever affected, because those go through a different hook
// (`processInputStep`), not this one, and get to keep their own freshly-produced
// reasoning/item-id pairing intact for as long as *this* call's own turn needs it.
//
// Net effect: replayed history is sent as plain conversational content with no leftover
// OpenAI response-chain identity attached, so the API never has anything to validate a
// "requires its reasoning item" pairing against.
import type { InputProcessor, ProcessInputArgs, ProcessInputResult } from '@mastra/core/processors';
import { getResponseProviderItemIdFromPart } from '@mastra/core/agent/message-list';
import type { MastraDBMessage, MastraMessagePart } from '@mastra/core/agent/message-list';

function isReasoningPart(part: MastraMessagePart): boolean {
  return part.type === 'reasoning';
}

function stripProviderItemLinkage(part: MastraMessagePart): MastraMessagePart {
  if (!getResponseProviderItemIdFromPart(part)) return part;
  const clone = { ...part } as MastraMessagePart & { providerMetadata?: unknown };
  delete clone.providerMetadata;
  return clone;
}

function sanitizeReplayedMessage(message: MastraDBMessage): MastraDBMessage {
  if (message.role !== 'assistant') return message;
  const parts = message.content.parts;
  if (!parts) return message;

  const sanitized = parts.filter((part) => !isReasoningPart(part)).map(stripProviderItemLinkage);
  if (sanitized.length === parts.length && sanitized.every((part, i) => part === parts[i])) {
    return message;
  }

  return {
    ...message,
    content: {
      ...message.content,
      parts: sanitized,
    },
  };
}

export const reasoningReplayGuard: InputProcessor = {
  id: 'reasoning-replay-guard',
  processInput({ messages }: ProcessInputArgs): ProcessInputResult {
    return messages.map(sanitizeReplayedMessage);
  },
};
