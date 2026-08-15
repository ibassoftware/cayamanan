import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import '@/modules/identity/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { defineAction, executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

// 02-identity-auth.md criterion 2 (role-based FORBIDDEN) and the framework's
// scope:'self' guarantee ("must not be able to widen it").
describe('identity authorization', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Authz Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Authz Test Co', legalName: 'Authz Test Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('an EMPLOYEE calling identity.listUsers (ADMIN-only) gets FORBIDDEN with no data leaked', async () => {
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });
    const result = await executeAction('identity.listUsers', {}, { session: employeeSession });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.message).not.toContain('@');
      expect(JSON.stringify(result.error)).not.toMatch(/email|password|user/i);
    }
  });

  it('an EMPLOYEE calling identity.createUser (ADMIN-only, high-risk) gets FORBIDDEN', async () => {
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });
    const result = await executeAction(
      'identity.createUser',
      { email: 'x@example.com', name: 'X', initialPassword: 'Password1234', roles: ['EMPLOYEE'] },
      { session: employeeSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it("scope:'self' actions receive ctx.employeeId from the session only — input cannot widen it", async () => {
    defineAction({
      id: 'test.selfScopeCannotWiden',
      title: 'Test: scope self cannot be widened by input',
      // A handler that (incorrectly) tries to trust an input-supplied employeeId.
      input: z.object({ employeeId: z.string().uuid() }).strict(),
      output: z.object({ ctxEmployeeId: z.string().nullable(), inputEmployeeId: z.string() }),
      read: true,
      risk: 'ordinary',
      roles: ['EMPLOYEE'],
      scope: 'self',
      async handler(input, ctx) {
        return { ctxEmployeeId: ctx.employeeId ?? null, inputEmployeeId: input.employeeId };
      },
    });

    const otherEmployeeId = '11111111-1111-1111-8111-111111111111';
    const session = testSession(tenantId, companyId, { roles: ['EMPLOYEE'], employeeId: null });
    const result = await executeAction(
      'test.selfScopeCannotWiden',
      { employeeId: otherEmployeeId },
      { session },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { ctxEmployeeId: string | null; inputEmployeeId: string };
      // ctx.employeeId always mirrors the session (null here — users.employee_id lands
      // in slice 04), never the input's attempt to claim a different employee.
      expect(data.ctxEmployeeId).toBe(session.employeeId);
      expect(data.ctxEmployeeId).not.toBe(data.inputEmployeeId);
    }
  });
});
