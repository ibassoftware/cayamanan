import { and, eq } from 'drizzle-orm';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';

import '@/modules/system/actions/register';
import '@/modules/ai/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { defineAction, executeAction, getAction } from '@/platform/actions';
import { systemSettings } from '@/platform/schema/settings';
import { getBootstrapDb } from '@/platform/db';
import { proposeAction } from '@/modules/ai/service/confirmations';
import { updateSettingAction } from '@/modules/system/actions/update-setting';
import { testSession } from './helpers/session';

// Regression coverage for the null/undefined confirmation-approval gap.
//
// OpenAI's structured tool-calling makes every property "required" and represents an
// omitted optional field as an explicit `{ "effectiveFrom": null }` in the tool call's
// JSON arguments, never an absent key. Missy's real agent path (an `Agent` with an
// OpenAI-family model, src/mastra/agents/missy-agent.ts) runs that through
// `@mastra/schema-compat`'s `transformNullToUndefined` before it ever reaches
// `proposeAction` — verified directly against that library's source
// (node_modules/@mastra/schema-compat/dist/index.js): for a field the schema does *not*
// require (an `.optional()` field, i.e. not in the JSON Schema's `required` list), it does
// `result[key] = undefined` — an *assignment*, so the key stays present on the object as
// an own property, only its value changes from `null` to `undefined`. It is never
// deleted. (A direct, no-model call to `tool.execute()`, as tests/missy-tool-bridge.test.ts
// uses for other cases, does NOT exercise this — that compat layer only attaches when an
// OpenAI-family model is present — so it is not used here; the propose-time input below
// reproduces that exact post-compat-layer shape instead, without needing a live model.)
//
// `hashInput`'s `stableStringify` (src/modules/ai/service/input-hash.ts) serializes a
// present-but-`undefined` value the same way as a present `null` value at the same key
// (both become `null` in the digest) — so the confirmation's stored hash, computed over
// that post-compat-layer `{ ..., effectiveFrom: undefined }` shape, is exactly what a
// client resubmitting the model's *original, literal* tool-call arguments (still carrying
// the real `{ effectiveFrom: null }`, since Mastra's compat layer is never persisted for
// the client to reconstruct later) will re-hash to. The hash check in `ai.approveAction`
// therefore passes — the input genuinely wasn't tampered with — and only then does the
// *target* action's own `executeAction()` call reject the literal `null` against
// `z.string().date().optional()`, which is the exact `VALIDATION_ERROR: expected string,
// received null` this fix addresses.
describe('ai.approveAction — null/undefined normalization for optional tool fields', () => {
  let tenantId: string;
  let companyId: string;
  let adminSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Null Normalization Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Null Normalization Co', legalName: 'Null Normalization Co Legal' })
      .returning();
    companyId = company.id;
    adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    // Test-only action (same pattern as tests/audit-single-call.test.ts): a
    // genuinely-optional field alongside a genuinely-`.nullable()` one, so the
    // normalization's schema-awareness can be proven in one call — the optional field's
    // null must be stripped before it reaches the handler, the nullable field's null must
    // not be.
    defineAction({
      id: 'test.nullNormalizationEcho',
      title: 'Test: echoes input back for null-normalization assertions',
      input: z
        .object({
          optionalField: z.string().optional(),
          meaningfulNullable: z.string().nullable(),
        })
        .strict(),
      output: z.object({ received: z.unknown() }),
      read: false,
      risk: 'high',
      roles: ['ADMIN'],
      scope: 'company',
      toolExposed: true,
      confirmationPreview(input) {
        return { optionalField: input.optionalField ?? null, meaningfulNullable: input.meaningfulNullable };
      },
      handler(input, ctx) {
        ctx.audit({ entityType: 'test', entityId: null, before: null, after: input });
        return Promise.resolve({ received: input });
      },
    });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('an omitted effectiveFrom — sent by the model as literal null, coerced to an omitted key by Mastra before proposeAction, but resubmitted by the client as the model\'s original literal null on Approve — works end to end and actually writes the setting', async () => {
    // What proposeAction actually receives on the real agent path: see the file-level
    // comment above for why this exact shape (key present, value `undefined`) is the
    // faithful reproduction, not a simplification.
    const proposal = await proposeAction(updateSettingAction, adminSession, {
      key: 'payroll.nullNormalizationEffectiveFrom',
      value: { mode: 'HALF_UP' },
      effectiveFrom: undefined,
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // What the chat panel resubmits on Approve: the tool call's real arguments as the
    // model produced them — still carrying the explicit `null` OpenAI actually sent,
    // since Mastra's compat-layer coercion happens only inside its own tool-invocation
    // pipeline and is never persisted anywhere for the client to reconstruct later.
    const approval = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: proposal.data.token,
        input: { key: 'payroll.nullNormalizationEffectiveFrom', value: { mode: 'HALF_UP' }, effectiveFrom: null },
      },
      { session: adminSession },
    );

    expect(approval.ok).toBe(true);

    const db = getBootstrapDb();
    const settingRow = await db
      .select({ value: systemSettings.value, effectiveFrom: systemSettings.effectiveFrom })
      .from(systemSettings)
      .where(and(eq(systemSettings.tenantId, tenantId), eq(systemSettings.key, 'payroll.nullNormalizationEffectiveFrom')));
    expect(settingRow).toHaveLength(1);
    expect(settingRow[0]?.value).toEqual({ mode: 'HALF_UP' });
    // The handler's own default ("today") kicked in — proof the field actually reached
    // the handler as omitted, never as a literal `null` value.
    expect(settingRow[0]?.effectiveFrom).toEqual(expect.any(String));
  });

  it('a field where null is meaningful (.nullable(), not .optional()) is never stripped, while a genuinely optional field sent as null still is', async () => {
    const echoAction = getAction('test.nullNormalizationEcho');
    expect(echoAction).toBeDefined();
    if (!echoAction) return;

    // Same faithful post-compat-layer shape as above: the genuinely optional field
    // arrives as key-present-value-undefined; the genuinely nullable field keeps its
    // real null untouched (it's in the JSON Schema's `required` list, so Mastra's own
    // compat layer would never touch it either — see the file-level comment).
    const proposal = await proposeAction(echoAction, adminSession, {
      optionalField: undefined,
      meaningfulNullable: null,
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    // The client resubmits the model's literal tool-call arguments — OpenAI's structured
    // output represents *both* an omitted optional field and an intentionally-cleared
    // nullable field as `null`; only the schema tells them apart.
    const approval = await executeAction(
      'ai.approveAction',
      {
        confirmationId: proposal.data.confirmationId,
        token: proposal.data.token,
        input: { optionalField: null, meaningfulNullable: null },
      },
      { session: adminSession },
    );

    expect(approval.ok).toBe(true);
    if (!approval.ok) return;
    const output = approval.data as { result: { received: Record<string, unknown> } };
    // The genuinely optional field's null was stripped (never reached the handler at
    // all) ...
    expect('optionalField' in output.result.received).toBe(false);
    // ... but the .nullable() field's null is a real, intentional value and survived to
    // the handler untouched — proving the normalization is schema-aware, not a blanket
    // null-strip that would silently corrupt an explicit "clear this value".
    expect(output.result.received.meaningfulNullable).toBeNull();
  });

  it('the existing redacted-preview regression tests are unaffected (sanity: still importable/registered)', () => {
    expect(updateSettingAction.id).toBe('system.updateSetting');
  });
});
