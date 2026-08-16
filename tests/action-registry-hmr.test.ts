import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineAction, getAction } from '@/platform/actions';

// Next's own global type augmentation declares `process.env.NODE_ENV` readonly (it's
// meant to be set once, by the tooling, not mutated at runtime) — this test is the one
// legitimate exception, simulating a production boot vs. dev-server hot-reload.
function setNodeEnv(value: string | undefined): void {
  (process.env as { NODE_ENV?: string }).NODE_ENV = value;
}

// Regression test for the Task 0 bug: Next's dev server hot-reloads an individual
// action module without necessarily re-evaluating every module that already imported
// the shared registry, so `defineAction()` runs again for an id already present. That
// must not throw outside a production boot (see the comment in src/platform/actions.ts
// `defineAction`) — a real duplicate id across two different action files is still a
// defect, so it must still throw in production.
describe('defineAction survives HMR-style re-registration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
  });

  function registerProbe(id: string, title: string) {
    return defineAction({
      id,
      title,
      input: z.object({}).strict(),
      output: z.object({}).strict(),
      read: true,
      risk: 'ordinary',
      roles: ['ADMIN'],
      scope: 'company',
      toolExposed: false,
      async handler() {
        return {};
      },
    });
  }

  it('re-registering the same id outside production overwrites instead of throwing', () => {
    const id = `test.hmrProbe.dev.${crypto.randomUUID()}`;
    setNodeEnv('development');

    registerProbe(id, 'First registration');
    expect(() => registerProbe(id, 'Second registration (simulated hot reload)')).not.toThrow();
    expect(getAction(id)?.title).toBe('Second registration (simulated hot reload)');
  });

  it('re-registering the same id in production still throws', () => {
    const id = `test.hmrProbe.prod.${crypto.randomUUID()}`;
    setNodeEnv('production');

    registerProbe(id, 'First registration');
    expect(() => registerProbe(id, 'Second registration')).toThrow(`Action already registered: ${id}`);
  });
});
