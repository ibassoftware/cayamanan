// Thin client-side caller for the action layer's single mutation/read endpoint
// (`POST /api/actions/[actionId]`, see src/app/api/actions/[actionId]/route.ts).
// Only imports the pure error/result types from src/platform/errors — never the
// action registry or db-backed modules — so this stays safe to bundle for the browser.
import type { ActionResult } from "@/platform/errors"

export async function callAction<TOutput>(
  actionId: string,
  input: Record<string, unknown> = {},
): Promise<ActionResult<TOutput>> {
  try {
    const response = await fetch(`/api/actions/${actionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })

    const body = (await response.json()) as ActionResult<TOutput>
    return body
  } catch {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Could not reach the server. Check your connection and try again.",
      },
    }
  }
}
