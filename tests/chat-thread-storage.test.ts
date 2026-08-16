import { describe, expect, it } from 'vitest';

import {
  clearPersistedThreadId,
  getPersistedThreadId,
  setPersistedThreadId,
  THREAD_STORAGE_KEY,
  type SimpleStorage,
} from '@/lib/chat/thread-storage';

function fakeStorage(): SimpleStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('thread-storage', () => {
  it('returns null when nothing has been persisted', () => {
    expect(getPersistedThreadId(fakeStorage())).toBeNull();
  });

  it('round-trips a persisted thread id', () => {
    const storage = fakeStorage();
    setPersistedThreadId(storage, 'thread-1');
    expect(storage.data.get(THREAD_STORAGE_KEY)).toBe('thread-1');
    expect(getPersistedThreadId(storage)).toBe('thread-1');
  });

  it('clears the persisted thread id', () => {
    const storage = fakeStorage();
    setPersistedThreadId(storage, 'thread-1');
    clearPersistedThreadId(storage);
    expect(getPersistedThreadId(storage)).toBeNull();
  });
});
