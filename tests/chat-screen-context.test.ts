import { describe, expect, it } from 'vitest';

import { deriveRouteContext } from '@/lib/chat/screen-context';

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
