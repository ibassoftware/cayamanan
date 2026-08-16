import { and, eq } from 'drizzle-orm';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import '@/modules/system/actions/register';
import '@/modules/ai/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { systemSettings } from '@/platform/schema/settings';
import { getBootstrapDb } from '@/platform/db';
import { proposeAction } from '@/modules/ai/service/confirmations';
import { updateSettingAction } from '@/modules/system/actions/update-setting';
import { testSession } from './helpers/session';

// Regression test for the chat panel's confirmation card (03-missy-foundation.md
// criterion 4/5, src/components/chat/confirmation-card.tsx): Approve must resubmit the
// tool call's *actual* input, never `preview`. `confirmationPreview()`
// (src/modules/ai/service/confirmations.ts) redacts sensitive values for display, so
// `preview` and the real input genuinely differ whenever a field is actually sensitive —
// unlike tests/missy-confirmation-flow.test.ts, which only ever proposes non-sensitive
// values (preview === input there, so it can't catch this class of bug). Approving with
// the redacted preview instead of the real input must fail the hash check (safe), never
// silently persist "[REDACTED]" into the setting.
describe('Missy confirmation flow — redacted preview vs. real input', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Redacted Preview Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Redacted Preview Co', legalName: 'Redacted Preview Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('the preview redacts a sensitive nested field while the real input keeps it', async () => {
    const realValue = { bankAccountNumber: '1234567890' };
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowRedactedBank1',
      value: realValue,
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // Proves this scenario actually exercises redaction — a prerequisite for the rest of
    // this file meaning anything.
    expect(proposal.data.preview).toEqual({
      key: 'payroll.confirmFlowRedactedBank1',
      value: { bankAccountNumber: '[REDACTED]' },
      effectiveFrom: null,
    });
  });

  it('approving with the real (unredacted) input succeeds and stores the real value, never the redacted preview', async () => {
    const realValue = { bankAccountNumber: '9876543210' };
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowRedactedBank2',
      value: realValue,
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // Sanity: preview really did diverge from the real input for this proposal.
    expect(proposal.data.preview).not.toEqual({
      key: 'payroll.confirmFlowRedactedBank2',
      value: realValue,
      effectiveFrom: null,
    });

    // What the chat panel's confirmation card actually resubmits on Approve — the tool
    // call's real arguments, never `preview` (src/components/chat/confirmation-card.tsx).
    const approval = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: proposal.data.token,
        input: { key: 'payroll.confirmFlowRedactedBank2', value: realValue },
      },
      { session: adminSession },
    );
    expect(approval.ok).toBe(true);

    const db = getBootstrapDb();
    const settingRow = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(and(eq(systemSettings.tenantId, tenantId), eq(systemSettings.key, 'payroll.confirmFlowRedactedBank2')));
    expect(settingRow).toHaveLength(1);
    // The real value, byte for byte — asserted explicitly so a silent-corruption
    // regression (storing "[REDACTED]" instead) fails loudly here.
    expect(settingRow[0]?.value).toEqual(realValue);
  });

  it('approving with the redacted preview as input fails the hash check, rather than silently storing "[REDACTED]"', async () => {
    const realValue = { bankAccountNumber: '5555555555' };
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.confirmFlowRedactedBank3',
      value: realValue,
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // The old (buggy) client behaviour this test guards against: resubmitting the
    // display-only preview instead of the tool call's real input.
    const result = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: proposal.data.token,
        input: proposal.data.preview as Record<string, unknown>,
      },
      { session: adminSession },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toMatch(/do not match/i);
    }

    const db = getBootstrapDb();
    const settingRow = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(and(eq(systemSettings.tenantId, tenantId), eq(systemSettings.key, 'payroll.confirmFlowRedactedBank3')));
    // Never written at all — least of all the redacted string.
    expect(settingRow).toHaveLength(0);
  });
});
