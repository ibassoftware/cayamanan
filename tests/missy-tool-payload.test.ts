import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import '@/modules/ui/actions/register';
import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { getBootstrapDb } from '@/platform/db';
import { buildActionTools } from '@/mastra/tools/action-tool-bridge';
import { testSession } from './helpers/session';

// The measured problem this seam exists to fix (see the slice brief): tool-schema payload
// sent to the model on every request. Same methodology as the baseline measurement this
// slice was scoped against — sum `id` + `description` + `z.toJSONSchema(inputSchema)`
// (JSON-stringified) over the offered set, for a realistic screen (`/app/employees`) vs
// the unscoped baseline. This is a real regression check, not just a one-off number: if a
// later slice's scoping table drifts and the reduction collapses, this test catches it.
function payloadChars(tools: Record<string, { id: string; description?: string; inputSchema?: unknown }>): number {
  let total = 0;
  for (const tool of Object.values(tools)) {
    const schemaJson = tool.inputSchema ? JSON.stringify(z.toJSONSchema(tool.inputSchema as z.ZodType)) : '';
    total += tool.id.length + (tool.description?.length ?? 0) + schemaJson.length;
  }
  return total;
}

describe('Missy tool payload — before/after scoping', () => {
  let tenantId: string;
  let companyId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Tool Payload Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Tool Payload Test Co', legalName: 'Tool Payload Test Co Legal' })
      .returning();
    companyId = company.id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('scoping /app/employees to employee+org tools shrinks the schema payload vs the unscoped baseline', () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const unscoped = buildActionTools(adminSession, 'thread-payload-baseline');
    const scopedToEmployees = buildActionTools(adminSession, 'thread-payload-employees', {
      screenContext: { module: 'employees' },
    });

    const unscopedCount = Object.keys(unscoped).length;
    const scopedCount = Object.keys(scopedToEmployees).length;
    const unscopedChars = payloadChars(unscoped);
    const scopedChars = payloadChars(scopedToEmployees);

    console.log(
      `[tool-payload] unscoped: ${unscopedCount} tools, ${unscopedChars} chars | ` +
        `/app/employees scoped: ${scopedCount} tools, ${scopedChars} chars | ` +
        `reduction: ${(100 * (1 - scopedChars / unscopedChars)).toFixed(1)}% chars, ` +
        `${(100 * (1 - scopedCount / unscopedCount)).toFixed(1)}% tool count`,
    );

    // Modest today on purpose: at the current 30-tool universe, org alone is 16 of them
    // and the employees screen legitimately needs org lookups too (department/position/
    // location typeaheads) — the slice brief calls this out explicitly. The mechanism's
    // payoff grows with the tool count later slices add (payroll, attendance, leave,
    // benefits...), which employees scoping excludes entirely; this assertion only
    // guards against the reduction regressing to zero or reversing.
    expect(scopedCount).toBeLessThan(unscopedCount);
    expect(scopedChars).toBeLessThan(unscopedChars);
  });

  it('a narrower screen (settings: identity+system only) shows the mechanism scaling as expected', () => {
    const adminSession = testSession(tenantId, companyId, { roles: ['ADMIN'] });

    const unscoped = buildActionTools(adminSession, 'thread-payload-baseline-2');
    const scopedToSettings = buildActionTools(adminSession, 'thread-payload-settings', {
      screenContext: { module: 'settings' },
    });

    const unscopedChars = payloadChars(unscoped);
    const scopedChars = payloadChars(scopedToSettings);

    console.log(
      `[tool-payload] unscoped: ${unscopedChars} chars | /app/settings scoped: ${scopedChars} chars | ` +
        `reduction: ${(100 * (1 - scopedChars / unscopedChars)).toFixed(1)}% chars`,
    );

    // /app/settings excludes the 16-tool org module and the 8-tool employee module —
    // the reduction here is the more representative preview of what scoping buys once
    // more modules (and more tools per module) exist.
    expect(scopedChars / unscopedChars).toBeLessThan(0.5);
  });
});
