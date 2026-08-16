import { describe, expect, it } from 'vitest';

import { deriveAnnouncement, extractMessageText, truncateForAnnouncement } from '@/lib/chat/announcer';

describe('deriveAnnouncement', () => {
  it('says nothing when the status has not changed (never announce per-token)', () => {
    expect(deriveAnnouncement('streaming', 'streaming', 'partial text so far')).toBeNull();
  });

  it('announces once entering submitted', () => {
    expect(deriveAnnouncement(null, 'submitted', '')).toBe('Missy is thinking…');
  });

  it('announces once entering streaming', () => {
    expect(deriveAnnouncement('submitted', 'streaming', '')).toBe('Missy is responding…');
  });

  it('announces the final reply once a turn completes', () => {
    expect(deriveAnnouncement('streaming', 'ready', 'Here is your answer.')).toBe(
      'Missy replied: Here is your answer.',
    );
  });

  it('falls back to a generic message when the reply has no text (e.g. tool-only turn)', () => {
    expect(deriveAnnouncement('streaming', 'ready', '')).toBe('Missy finished responding.');
  });

  it('does not re-announce "ready" reached from an already-ready state', () => {
    expect(deriveAnnouncement('ready', 'ready', 'text')).toBeNull();
  });

  it('announces a failure', () => {
    expect(deriveAnnouncement('streaming', 'error', '')).toBe('Missy could not complete that request.');
  });
});

describe('truncateForAnnouncement', () => {
  it('leaves short text untouched', () => {
    expect(truncateForAnnouncement('short reply')).toBe('short reply');
  });

  it('truncates very long text with a note', () => {
    const long = 'a'.repeat(700);
    const truncated = truncateForAnnouncement(long);
    expect(truncated.length).toBeLessThan(long.length);
    expect(truncated).toContain('see chat panel for the full reply');
  });
});

describe('extractMessageText', () => {
  it('joins text parts and ignores non-text parts', () => {
    const message = {
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Hello ' },
        { type: 'dynamic-tool' },
        { type: 'text', text: 'world.' },
      ],
    };
    expect(extractMessageText(message)).toBe('Hello world.');
  });

  it('returns an empty string for undefined', () => {
    expect(extractMessageText(undefined)).toBe('');
  });
});
