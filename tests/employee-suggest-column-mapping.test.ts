import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mocked before any module that might import it (transitively, via
// employee.suggestColumnMapping's own handler) so no real model call is ever attempted —
// per the task's own instruction, this test must not hit a real API.
const suggestUnmappedColumns = vi.fn();
vi.mock('@/mastra/agents/column-mapping-agent', () => ({
  suggestUnmappedColumns: (...args: unknown[]) => suggestUnmappedColumns(...args),
}));

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { eq } from 'drizzle-orm';
import { testSession } from './helpers/session';

describe('employee.suggestColumnMapping', () => {
  let tenantId: string;
  let companyId: string;
  let hrSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Suggest Mapping Test Tenant', status: 'active' })
      .returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Suggest Mapping Test Co', legalName: 'Suggest Mapping Test Co Legal' })
      .returning();
    companyId = company.id;
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('never calls the model when the header already resolves deterministically', async () => {
    suggestUnmappedColumns.mockClear();
    const result = await executeAction(
      'employee.suggestColumnMapping',
      { header: ['employeeNo', 'firstName', 'lastName'], sampleRows: [['EMP-1', 'Maria', 'Santos']] },
      { session: hrSession },
    );
    expect(result.ok).toBe(true);
    expect(suggestUnmappedColumns).not.toHaveBeenCalled();
    if (!result.ok) return;
    const data = result.data as { mappings: { column: string; field: string | null; confidence: string }[] };
    expect(data.mappings).toEqual([
      { column: 'employeeNo', field: 'employeeNo', confidence: 'high' },
      { column: 'firstName', field: 'firstName', confidence: 'high' },
      { column: 'lastName', field: 'lastName', confidence: 'high' },
    ]);
  });

  it('only asks the model about columns mapColumns left unresolved, never the ones it already matched', async () => {
    suggestUnmappedColumns.mockClear();
    suggestUnmappedColumns.mockResolvedValue([{ column: 'Given Name', field: 'firstName', confidence: 'high' }]);

    const result = await executeAction(
      'employee.suggestColumnMapping',
      {
        header: ['employeeNo', 'Given Name'],
        sampleRows: [['EMP-1', 'Maria']],
      },
      { session: hrSession },
    );
    expect(result.ok).toBe(true);

    expect(suggestUnmappedColumns).toHaveBeenCalledTimes(1);
    const [columnsArg] = suggestUnmappedColumns.mock.calls[0] as [{ column: string; samples: string[] }[], string | undefined];
    expect(columnsArg).toEqual([{ column: 'Given Name', samples: ['Maria'] }]);

    if (!result.ok) return;
    const data = result.data as { mappings: { column: string; field: string | null; confidence: string }[] };
    expect(data.mappings).toEqual([
      { column: 'employeeNo', field: 'employeeNo', confidence: 'high' },
      { column: 'Given Name', field: 'firstName', confidence: 'high' },
    ]);
  });

  it('drops/nulls a field name the model invents, never passing it through', async () => {
    suggestUnmappedColumns.mockClear();
    suggestUnmappedColumns.mockResolvedValue([
      // "salary" is not in IMPORT_FIELDS at all — a model hallucinating a destination
      // outside the real field list must never survive into the action's output.
      { column: 'Pay', field: 'salary', confidence: 'high' },
    ]);

    const result = await executeAction(
      'employee.suggestColumnMapping',
      { header: ['employeeNo', 'Pay'], sampleRows: [] },
      { session: hrSession },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { mappings: { column: string; field: string | null; confidence: string }[] };
    expect(data.mappings.find((m) => m.column === 'Pay')).toEqual({ column: 'Pay', field: null, confidence: 'low' });
  });

  it('dedupes: if the model maps two unmapped columns to the same field, only the first is kept', async () => {
    suggestUnmappedColumns.mockClear();
    suggestUnmappedColumns.mockResolvedValue([
      { column: 'Contact No', field: 'mobile', confidence: 'high' },
      { column: 'Phone', field: 'mobile', confidence: 'low' },
    ]);

    const result = await executeAction(
      'employee.suggestColumnMapping',
      { header: ['employeeNo', 'Contact No', 'Phone'], sampleRows: [] },
      { session: hrSession },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { mappings: { column: string; field: string | null; confidence: string }[] };
    expect(data.mappings.find((m) => m.column === 'Contact No')?.field).toBe('mobile');
    expect(data.mappings.find((m) => m.column === 'Phone')?.field).toBe(null);
  });

  it('truncates sample rows to 3 regardless of how many the client sends', async () => {
    suggestUnmappedColumns.mockClear();
    suggestUnmappedColumns.mockResolvedValue([{ column: 'Given Name', field: 'firstName', confidence: 'high' }]);

    const sampleRows = [['EMP-1', 'A'], ['EMP-2', 'B'], ['EMP-3', 'C'], ['EMP-4', 'D'], ['EMP-5', 'E']];
    const result = await executeAction(
      'employee.suggestColumnMapping',
      { header: ['employeeNo', 'Given Name'], sampleRows },
      { session: hrSession },
    );
    expect(result.ok).toBe(true);
    const [columnsArg] = suggestUnmappedColumns.mock.calls[0] as [{ column: string; samples: string[] }[], string | undefined];
    expect(columnsArg[0]?.samples).toEqual(['A', 'B', 'C']);
  });

  it('rejects a sample row whose length does not match the header', async () => {
    const result = await executeAction(
      'employee.suggestColumnMapping',
      { header: ['employeeNo', 'firstName'], sampleRows: [['EMP-1']] },
      { session: hrSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('is FORBIDDEN for an EMPLOYEE role', async () => {
    const employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });
    const result = await executeAction(
      'employee.suggestColumnMapping',
      { header: ['employeeNo'], sampleRows: [] },
      { session: employeeSession },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});
