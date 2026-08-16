// Persists the active thread id client-side so a full page reload can reopen the same
// conversation (03-missy-foundation.md criterion 1). Ownership is re-verified server-side
// on every load (`GET /api/chat?threadId=...` -> getOwnedThread) — this storage is a
// convenience pointer only, never trusted as proof the thread belongs to the current user.
//
// Storage is injected (`Pick<Storage, ...>`) rather than reaching for `window.localStorage`
// directly, so this stays unit-testable without a DOM.
export const THREAD_STORAGE_KEY = "missy.threadId"

export type SimpleStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export function getPersistedThreadId(storage: SimpleStorage): string | null {
  return storage.getItem(THREAD_STORAGE_KEY)
}

export function setPersistedThreadId(storage: SimpleStorage, threadId: string): void {
  storage.setItem(THREAD_STORAGE_KEY, threadId)
}

export function clearPersistedThreadId(storage: SimpleStorage): void {
  storage.removeItem(THREAD_STORAGE_KEY)
}
