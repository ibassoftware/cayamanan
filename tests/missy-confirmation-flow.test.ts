import { and, count, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import '@/modules/system/actions/register';
import '@/modules/ai/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { auditLogs } from '@/platform/schema/audit';
import { systemSettings } from '@/platform/schema/settings';
import { getBootstrapDb } from '@/platform/db';
import { proposeAction } from '@/modules/ai/service/confirmations';
import { updateSettingAction } from '@/modules/system/actions/update-setting';
import { testSession } from './helpers/session';

// Proves 03-missy-foundation.md criteria 4/5: a high-risk action proposed by Missy only
// applies once a real, single-use, expiring, unforgeable token is redeemed via
// ai.approveAction — never through the model itself.
describe('Missy confirmation flow (ai.approveAction)', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Confirmation Flow Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Confirmation Flow Co', legalName: 'Confirmation Flow Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function auditCountFor(actionId: string, actorKind: string) {
    const db = getBootstrapDb();
    const [row] = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, actionId), eq(auditLogs.actorKind, actorKind)));
    return row?.n ?? 0;
  }

  it('approving applies the change and audits it with actor_kind MISSY', async () => {
    const before = await auditCountFor('system.updateSetting', 'MISSY');

    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowTest',
      value: { mode: 'HALF_UP' },
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const approval = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: proposal.data.token,
        input: { key: 'payroll.confirmFlowTest', value: { mode: 'HALF_UP' } },
      },
      { session: adminSession },
    );
    expect(approval.ok).toBe(true);
    if (approval.ok) {
      expect((approval.data as { actionId: string }).actionId).toBe('system.updateSetting');
    }

    expect(await auditCountFor('system.updateSetting', 'MISSY')).toBe(before + 1);

    const db = getBootstrapDb();
    const [row] = await db
      .select({ confirmationToken: auditLogs.confirmationToken })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actionId, 'system.updateSetting'), eq(auditLogs.actorKind, 'MISSY')))
      .limit(1);
    expect(row?.confirmationToken).toBe(proposal.data.token);

    const settingRow = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(and(eq(systemSettings.tenantId, tenantId), eq(systemSettings.key, 'payroll.confirmFlowTest')));
    expect(settingRow).toHaveLength(1);
    expect(settingRow[0]?.value).toEqual({ mode: 'HALF_UP' });
  });

  it('approving the same confirmation twice fails with a consumed-token error', async () => {
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowTestTwice',
      value: { mode: 'HALF_UP' },
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const input = { key: 'payroll.confirmFlowTestTwice', value: { mode: 'HALF_UP' } };
    const first = await executeAction(
      'ai.approveAction',
      { confirmationId: proposal.data.confirmationId, token: proposal.data.token, input },
      { session: adminSession },
    );
    expect(first.ok).toBe(true);

    const second = await executeAction(
      'ai.approveAction',
      { confirmationId: proposal.data.confirmationId, token: proposal.data.token, input },
      { session: adminSession },
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('CONFLICT');
      expect(second.error.message).toMatch(/already been used/i);
    }
  });

  it('approving after the 5-minute TTL fails with an expiry error', async () => {
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowTestExpiry',
      value: { mode: 'HALF_UP' },
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);

    const result = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: proposal.data.token,
        input: { key: 'payroll.confirmFlowTestExpiry', value: { mode: 'HALF_UP' } },
      },
      { session: adminSession },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.message).toMatch(/expired/i);
    }
  });

  it('the token is not forgeable — a tampered token is rejected', async () => {
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowTestTamper',
      value: { mode: 'HALF_UP' },
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const tamperedToken = `${proposal.data.confirmationId}:not-a-real-signature`;
    const result = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: tamperedToken,
        input: { key: 'payroll.confirmFlowTestTamper', value: { mode: 'HALF_UP' } },
      },
      { session: adminSession },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('a valid token cannot be reused with different input than it was issued for', async () => {
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowTestSwap',
      value: { mode: 'HALF_UP' },
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const result = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: proposal.data.token,
        // Different value than what was proposed and hashed.
        input: { key: 'payroll.confirmFlowTestSwap', value: { mode: 'HALF_DOWN' } },
      },
      { session: adminSession },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toMatch(/do not match/i);
    }
  });

  it('a token issued to one user cannot be approved by another', async () => {
    const otherSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowTestOwner',
      value: { mode: 'HALF_UP' },
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const result = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: proposal.data.token,
        input: { key: 'payroll.confirmFlowTestOwner', value: { mode: 'HALF_UP' } },
      },
      { session: otherSession },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
