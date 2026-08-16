/**
 * Mastra injects its own memory-maintenance tools when `workingMemory` is enabled. They
 * are not registry action ids and mean nothing to an HR user, so the panel hides them.
 *
 * This lives here rather than beside the renderer because two places must agree on it:
 * `ChatMessage` (which decides what to draw) and `ChatPanel` (which decides whether the
 * assistant has produced anything visible yet). When only the renderer knew, the
 * "Missy is thinking…" indicator switched off as soon as the hidden memory tool arrived
 * — leaving a reasoning block, nothing, and no spinner while the model was still
 * generating its answer. It looked exactly like a frozen turn.
 */
const INTERNAL_TOOL_NAMES = new Set(["updateWorkingMemory", "__updateWorkingMemory"]);

/** True for a message part the chat panel deliberately does not render. */
export function isInternalToolPart(part: { type: string }): boolean {
  if (!part.type.startsWith("tool-")) return false;
  return INTERNAL_TOOL_NAMES.has(part.type.slice("tool-".length));
}

/** True if this part is something the user will actually see rendered. */
export function isVisibleOutputPart(part: { type: string }): boolean {
  if (part.type === "text") return true;
  return part.type.startsWith("tool-") && !isInternalToolPart(part);
}
