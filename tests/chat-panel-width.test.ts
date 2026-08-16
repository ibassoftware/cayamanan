import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PANEL_WIDTH,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  PANEL_WIDTH_STORAGE_KEY,
  clampPanelWidth,
  getPersistedPanelWidth,
  nextPanelWidthForKey,
  nextPanelWidthForPointerDelta,
  setPersistedPanelWidth,
  type SimpleStorage,
} from '@/lib/chat/panel-width';

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

describe('clampPanelWidth', () => {
  it('leaves an in-range width untouched', () => {
    expect(clampPanelWidth(400)).toBe(400);
  });

  it('floors below the minimum', () => {
    expect(clampPanelWidth(10)).toBe(MIN_PANEL_WIDTH);
  });

  it('caps above the maximum', () => {
    expect(clampPanelWidth(10000)).toBe(MAX_PANEL_WIDTH);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampPanelWidth(Number.NaN)).toBe(DEFAULT_PANEL_WIDTH);
    expect(clampPanelWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PANEL_WIDTH);
  });
});

describe('panel width persistence', () => {
  it('returns the default when nothing has been persisted', () => {
    expect(getPersistedPanelWidth(fakeStorage())).toBe(DEFAULT_PANEL_WIDTH);
  });

  it('round-trips a persisted width', () => {
    const storage = fakeStorage();
    setPersistedPanelWidth(storage, 420);
    expect(storage.data.get(PANEL_WIDTH_STORAGE_KEY)).toBe('420');
    expect(getPersistedPanelWidth(storage)).toBe(420);
  });

  it('clamps an out-of-range value before persisting', () => {
    const storage = fakeStorage();
    setPersistedPanelWidth(storage, 9999);
    expect(getPersistedPanelWidth(storage)).toBe(MAX_PANEL_WIDTH);
  });

  it('clamps a corrupted stored value on read', () => {
    const storage = fakeStorage();
    storage.setItem(PANEL_WIDTH_STORAGE_KEY, 'not-a-number');
    expect(getPersistedPanelWidth(storage)).toBe(DEFAULT_PANEL_WIDTH);
  });
});

describe('nextPanelWidthForPointerDelta', () => {
  it('widens the panel when the handle moves left (negative delta)', () => {
    expect(nextPanelWidthForPointerDelta(400, -20)).toBe(420);
  });

  it('narrows the panel when the handle moves right (positive delta)', () => {
    expect(nextPanelWidthForPointerDelta(400, 20)).toBe(380);
  });

  it('clamps drag results to the bounds', () => {
    expect(nextPanelWidthForPointerDelta(MIN_PANEL_WIDTH, 500)).toBe(MIN_PANEL_WIDTH);
    expect(nextPanelWidthForPointerDelta(MAX_PANEL_WIDTH, -500)).toBe(MAX_PANEL_WIDTH);
  });
});

describe('nextPanelWidthForKey', () => {
  it('ArrowLeft widens, ArrowRight narrows', () => {
    expect(nextPanelWidthForKey(400, 'ArrowLeft')).toBe(416);
    expect(nextPanelWidthForKey(400, 'ArrowRight')).toBe(384);
  });

  it('Home and End jump to the bounds', () => {
    expect(nextPanelWidthForKey(400, 'Home')).toBe(MIN_PANEL_WIDTH);
    expect(nextPanelWidthForKey(400, 'End')).toBe(MAX_PANEL_WIDTH);
  });

  it('PageUp/PageDown take a bigger step than the arrow keys', () => {
    expect(nextPanelWidthForKey(400, 'PageUp')).toBe(464);
    expect(nextPanelWidthForKey(400, 'PageDown')).toBe(336);
  });

  it('clamps at the bounds instead of overshooting', () => {
    expect(nextPanelWidthForKey(MAX_PANEL_WIDTH, 'ArrowLeft')).toBe(MAX_PANEL_WIDTH);
    expect(nextPanelWidthForKey(MIN_PANEL_WIDTH, 'ArrowRight')).toBe(MIN_PANEL_WIDTH);
  });

  it('returns null for keys it does not handle', () => {
    expect(nextPanelWidthForKey(400, 'Escape')).toBeNull();
    expect(nextPanelWidthForKey(400, 'Tab')).toBeNull();
  });
});
