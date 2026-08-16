import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { companies, tenants } from '@/modules/org/schema';
import { defineAction, executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

// Proves redact() (previously dead code — nothing imported it) is actually wired into
// the executeAction() handler-failure log path: a thrown error whose message mentions a
// sensitive field must never reach console.error unredacted.
describe('executeAction redacts sensitive error content before logging', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Redaction Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Redaction Test Co', legalName: 'Redaction Test Co Legal' })
      .returning();
    companyId = company.id;

    defineAction({
      id: 'test.throwsSensitiveError',
      title: 'Test: throws an error with a sensitive message',
      input: z.object({}).strict(),
      output: z.object({}),
      read: true,
      risk: 'ordinary',
      roles: ['ADMIN', 'HR_PAYROLL', 'EMPLOYEE'],
      scope: 'company',
      toolExposed: false,
      async handler() {
        throw new Error('failed to update salary to 999999 for bankAccountNumber 12345');
      },
    });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('redacts the logged message so it never contains the sensitive value or field names', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await executeAction(
        'test.throwsSensitiveError',
        {},
        { session: testSession(tenantId, companyId) },
      );
      expect(result.ok).toBe(false);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedPayload = JSON.stringify(errorSpy.mock.calls[0]?.[1]);
      expect(loggedPayload).toContain('[REDACTED]');
      expect(loggedPayload).not.toContain('999999');
      expect(loggedPayload).not.toContain('salary');
      expect(loggedPayload).not.toContain('bankAccountNumber');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
