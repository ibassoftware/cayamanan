import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';

import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import '@/modules/ui/actions/register';
import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { userRoles, users } from '@/modules/identity/schema';
import { hashPassword } from '@/modules/identity/service/password';
import { executeAction, type VerifiedSession } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { mastra } from '@/mastra';

// Live-model check (real OpenAI call — see missy-agent-live.test.ts for why this is kept
// to a single turn) for the actual gap the slice brief measured: before
// src/platform/fields.ts existed, `employee.updateGovernmentIds`'s five look-alike
// government-id fields (sssNo/philhealthNo/pagibigNo/tin/hdmfMid) carried nothing but
// their bare names for Missy to go on. This asks her to update one specific one
// (Pag-IBIG) and confirms — by reading the row back through `employee.get`, never by
// trusting her own narration — that she wrote to `pagibigNo`, not one of the other four
// look-alike fields (most plausibly `hdmfMid`, the other Pag-IBIG-labelled column; see
// fields.ts's `hdmfMid` doc comment).
const LIVE = Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!LIVE)('Missy — a described government-id field gets populated correctly (live)', () => {
  let tenantId: string;
  let companyId: string;
  let session: VerifiedSession;
  let threadId: string;
  const email = `missy-live-field-${crypto.randomUUID()}@example.com`;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Missy Live Field Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Missy Live Field Test Co', legalName: 'Missy Live Field Test Co Legal' })
      .returning();
    companyId = company.id;

    const passwordHash = await hashPassword('missy-live-field-test-password-1');
    const [user] = await db
      .insert(users)
      .values({ tenantId, companyId, email, name: 'Missy Live Field Test User', passwordHash, status: 'ACTIVE', mustChangePassword: false })
      .returning();
    await db.insert(userRoles).values({ tenantId, userId: user.id, role: 'ADMIN' });

    session = { tenantId, companyId, userId: user.id, employeeId: null, roles: ['ADMIN'], sessionId: crypto.randomUUID() };

    const created = await executeAction(
      'employee.create',
      { employeeNo: 'FIELD-0001', firstName: 'Field', lastName: 'Test', hireDate: '2025-01-01' },
      { session },
    );
    if (!created.ok) throw new Error('failed to create employee for live test');

    const thread = await executeAction('ai.createThread', {}, { session });
    if (!thread.ok) throw new Error('failed to create thread for live test');
    threadId = (thread.data as { id: string }).id;
  }, 30000);

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(userRoles).where(eq(userRoles.tenantId, tenantId));
    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it(
    'asking Missy to set employee FIELD-0001’s Pag-IBIG number writes pagibigNo, not hdmfMid/tin/sssNo/philhealthNo',
    async () => {
      const agent = mastra.getAgentById('missy');
      const requestContext = new RequestContext();
      requestContext.set('session', session);
      requestContext.set('threadId', threadId);

      const turn = await agent.generate(
        'Set employee FIELD-0001’s Pag-IBIG number to 4321-5678-9012.',
        { memory: { thread: threadId, resource: session.userId }, requestContext },
      );
      expect(turn.text).toBeTruthy();

      const detail = await executeAction('employee.get', { employeeNo: 'FIELD-0001' }, { session });
      expect(detail.ok).toBe(true);
      if (!detail.ok) return;
      const govIds = (detail.data as { governmentIds: Record<string, string | null> | null }).governmentIds;

      expect(govIds?.pagibigNo).toBe('4321-5678-9012');
      expect(govIds?.hdmfMid ?? null).toBeNull();
      expect(govIds?.tin ?? null).toBeNull();
      expect(govIds?.sssNo ?? null).toBeNull();
      expect(govIds?.philhealthNo ?? null).toBeNull();
    },
    60000,
  );
});
