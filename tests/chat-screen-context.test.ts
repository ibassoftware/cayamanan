import { describe, expect, it } from 'vitest';

import { deriveRouteContext, extractScreenModule } from '@/lib/chat/screen-context';

describe('deriveRouteContext', () => {
  it('has no module on the app home screen', () => {
    expect(deriveRouteContext('/app')).toEqual({ route: '/app', module: null });
    expect(deriveRouteContext('/app/')).toEqual({ route: '/app/', module: null });
  });

  it('derives the module from the first segment after /app', () => {
    expect(deriveRouteContext('/app/settings/system')).toEqual({
      route: '/app/settings/system',
      module: 'settings',
    });
    expect(deriveRouteContext('/app/me/security')).toEqual({ route: '/app/me/security', module: 'me' });
  });
});

// extractScreenModule reads client-supplied JSON off the wire (a chat message's
// `metadata`) — it must degrade to `null` rather than throw on anything malformed, since
// a malicious or buggy client must only ever be able to narrow/widen which tools are
// *offered* (src/mastra/tools/action-tool-bridge.ts), never crash the request.
describe('extractScreenModule', () => {
  it('reads the module field out of well-formed screen-context metadata', () => {
    expect(extractScreenModule({ route: '/app/employees', module: 'employees', entityType: null, entityId: null, filters: null })).toBe(
      'employees',
    );
  });

  it('returns null for missing, malformed or hostile metadata', () => {
    expect(extractScreenModule(undefined)).toBeNull();
    expect(extractScreenModule(null)).toBeNull();
    expect(extractScreenModule('employees')).toBeNull();
    expect(extractScreenModule(42)).toBeNull();
    expect(extractScreenModule({})).toBeNull();
    expect(extractScreenModule({ module: null })).toBeNull();
    expect(extractScreenModule({ module: 123 })).toBeNull();
    expect(extractScreenModule({ module: { toString: () => 'employees' } })).toBeNull();
    expect(extractScreenModule({ module: ['employees'] })).toBeNull();
  });
});
