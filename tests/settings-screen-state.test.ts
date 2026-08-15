import { describe, expect, it } from 'vitest';

import {
  deriveSettingsScreenState,
  formatSettingValue,
  parseSettingValueInput,
  validateSettingKey,
} from '@/components/settings/settings-state';

// Pure UI-logic tests for the system settings screen (src/app/app/(app)/settings/system).
// No DOM/component rendering here (no testing-library in this project) — these cover
// the state-machine and validation functions the screen's rendering branches on,
// including the no-permission branch that today's hardcoded-ADMIN action layer never
// actually triggers over HTTP (see slice-02 TODO in src/platform/actions.ts).
describe('deriveSettingsScreenState', () => {
  it('is loading while no result has arrived yet', () => {
    expect(deriveSettingsScreenState(null)).toEqual({ status: 'loading' });
  });

  it('maps a FORBIDDEN action error to the no-permission state', () => {
    const state = deriveSettingsScreenState({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
    });
    expect(state).toEqual({ status: 'no-permission' });
  });

  it('maps any other action error to the generic error state, preserving the message', () => {
    const state = deriveSettingsScreenState({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    });
    expect(state).toEqual({ status: 'error', message: 'Something went wrong. Please try again.' });
  });

  it('is ready with an empty list when there are no settings', () => {
    const state = deriveSettingsScreenState({ ok: true, data: { settings: [] } });
    expect(state).toEqual({ status: 'ready', settings: [] });
  });

  it('is ready with the returned settings otherwise', () => {
    const settings = [{ key: 'payroll.roundingPolicy', value: { mode: 'HALF_UP' }, effectiveFrom: '2026-08-15' }];
    const state = deriveSettingsScreenState({ ok: true, data: { settings } });
    expect(state).toEqual({ status: 'ready', settings });
  });
});

describe('validateSettingKey', () => {
  it('rejects an empty key', () => {
    expect(validateSettingKey('   ')).toEqual({ ok: false, message: 'Enter a key.' });
  });

  it('rejects a key with invalid characters', () => {
    const result = validateSettingKey('payroll roundingPolicy!');
    expect(result.ok).toBe(false);
  });

  it('accepts and trims a well-formed dotted key', () => {
    expect(validateSettingKey('  payroll.roundingPolicy  ')).toEqual({
      ok: true,
      value: 'payroll.roundingPolicy',
    });
  });
});

describe('parseSettingValueInput', () => {
  it('rejects empty input', () => {
    expect(parseSettingValueInput('  ')).toEqual({ ok: false, message: 'Enter a value.' });
  });

  it('rejects invalid JSON', () => {
    const result = parseSettingValueInput('{not json}');
    expect(result.ok).toBe(false);
  });

  it('parses a quoted string, a number, a boolean, and an object', () => {
    expect(parseSettingValueInput('"HALF_UP"')).toEqual({ ok: true, value: 'HALF_UP' });
    expect(parseSettingValueInput('42')).toEqual({ ok: true, value: 42 });
    expect(parseSettingValueInput('true')).toEqual({ ok: true, value: true });
    expect(parseSettingValueInput('{"mode":"HALF_UP"}')).toEqual({
      ok: true,
      value: { mode: 'HALF_UP' },
    });
  });
});

describe('formatSettingValue', () => {
  it('renders strings as quoted JSON and other values pretty-printed', () => {
    expect(formatSettingValue('HALF_UP')).toBe('"HALF_UP"');
    expect(formatSettingValue(42)).toBe('42');
    expect(formatSettingValue({ mode: 'HALF_UP' })).toBe('{\n  "mode": "HALF_UP"\n}');
  });
});
