import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';

import { missyAgent } from '@/mastra/agents/missy-agent';

// Proves the per-request model resolver (missy-agent.ts) picks up a request-scoped
// OpenAI key when the chat route sets one (src/app/api/chat/route.ts), and otherwise
// falls back to the plain model id string — never touching `process.env` (see the
// resolver's own comment for why a fresh model instance per call is race-free across
// concurrent requests from different tenants/companies).
describe('missyAgent model resolver', () => {
  it('uses the request-scoped OpenAI key when present', async () => {
    const requestContext = new RequestContext();
    requestContext.set('openaiApiKey', 'sk-request-scoped-key');

    // `config` is a ModelRouterLanguageModel-internal property with no exported type;
    // asserting on it directly is the only way to prove the resolved apiKey reached the
    // model config.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (await missyAgent.getModel({ requestContext })) as any;
    expect(model.modelId).toContain('luna');
    expect(model.config.apiKey).toBe('sk-request-scoped-key');
  });

  it('falls back to the plain model id when no key is set on the request context', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (await missyAgent.getModel({ requestContext: new RequestContext() })) as any;
    expect(model.modelId).toContain('luna');
    expect(model.config.apiKey).toBeUndefined();
  });
});
