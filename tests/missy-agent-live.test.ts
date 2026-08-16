import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';

import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import '@/modules/ui/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { userRoles, users } from '@/modules/identity/schema';
import { hashPassword } from '@/modules/identity/service/password';
import { executeAction, type VerifiedSession } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { mastra } from '@/mastra';

// Live-model tests (real OpenAI calls, kept to a minimum — two turns total):
//
// 1. Acceptance criterion 1's hardest case: a full page reload mid-conversation. This
//    test simulates it directly at the agent layer (bypassing the HTTP/streaming
//    plumbing, which is not this test's concern) by making two independent, sequential
//    `generate()` calls on the *same* Mastra thread/resource — nothing from the first
//    call's in-memory state carries into the second except what memory recall pulls back
//    out of Postgres. That is exactly the path that triggered the reported landmine
//    ("Item ... was provided without its required 'reasoning' item") before
//    src/mastra/processors/reasoning-replay-guard.ts existed — this test exists so a
//    regression here fails loudly instead of rotting silently.
// 2. Acceptance criterion 7: inspects the actual `mastra_ai_spans` observability rows
//    this conversation produced and asserts the real user's email never appears in them
//    verbatim, proving src/mastra/index.ts's SensitiveDataFilter configuration actually
//    redacts identity.me's tool output before it reaches a trace.
const LIVE = Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!LIVE)('Missy agent — live (multi-turn reload-and-continue, trace redaction)', () => {
  let tenantId: string;
  let companyId: string;
  let session: VerifiedSession;
  let threadId: string;
  const email = `missy-live-trace-${crypto.randomUUID()}@example.com`;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Missy Live Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Missy Live Test Co', legalName: 'Missy Live Test Co Legal' })
      .returning();
    companyId = company.id;

    const passwordHash = await hashPassword('missy-live-test-password-1');
    const [user] = await db
      .insert(users)
      .values({ tenantId, companyId, email, name: 'Missy Live Test User', passwordHash, status: 'ACTIVE', mustChangePassword: false })
      .returning();
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'ADMIN' });

    session = {
      tenantId,
      companyId,
      userId: user.id,
      employeeId: null,
      roles: ['ADMIN'],
      sessionId: crypto.randomUUID(),
    };

    const created = await executeAction('ai.createThread', {}, { session });
    if (!created.ok) throw new Error('failed to create thread for live test');
    threadId = (created.data as { id: string }).id;
  }, 30000);

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(userRoles).where(eq(userRoles.tenantId, tenantId));
    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it(
    'a second, independent call on the same thread does not crash, and no trace contains the user email',
    async () => {
      const agent = mastra.getAgentById('missy');
      // Mirrors src/app/api/chat/route.ts's buildRequestContext — the tool bridge reads
      // `session`/`threadId` off this, exactly as a real chat request would.
      function buildRequestContext(): RequestContext {
        const requestContext = new RequestContext();
        requestContext.set('session', session);
        requestContext.set('threadId', threadId);
        return requestContext;
      }
      const memory = { thread: threadId, resource: session.userId };

      const turn1 = await agent.generate('Who am I and what can you do for me?', {
        memory,
        requestContext: buildRequestContext(),
      });
      expect(turn1.text).toBeTruthy();

      // Simulated reload: a brand-new call, a brand-new RequestContext — nothing from
      // `turn1` above is reused except the thread/resource ids. This rebuilds everything
      // from Postgres-backed memory recall, the same as a fresh HTTP request after a
      // browser reload.
      const turn2 = await agent.generate('Thanks — briefly, what did you just tell me about myself?', {
        memory,
        requestContext: buildRequestContext(),
      });
      expect(turn2.text).toBeTruthy();

      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        const { rows } = await pool.query(
          `select input, output, attributes, metadata, name, "requestContext"
             from mastra_ai_spans
            where "threadId" = $1`,
          [threadId],
        );
        expect(rows.length).toBeGreaterThan(0);

        const serialized = JSON.stringify(rows);
        expect(serialized).not.toContain(email);
      } finally {
        await pool.end();
      }
    },
    90000,
  );
});
