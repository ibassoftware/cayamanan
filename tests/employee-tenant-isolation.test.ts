import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { employees } from '@/modules/employee/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb, withTenantContext } from '@/platform/db';
import { testSession } from './helpers/session';

// Criterion 7: an employee row seeded under tenant B (and, separately, under a sibling
// company within the same tenant) must be invisible to every query under tenant A / a
// different company — two real tenants/companies, a real query, zero rows. Proves this
// at both the action layer (employee.list/employee.get) and the raw RLS layer.
describe('employee cross-tenant/cross-company isolation', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    if (createdTenantIds.length === 0) return;
    const db = getBootstrapDb();
    for (const tenantId of createdTenantIds) {
      await db.delete(employees).where(eq(employees.tenantId, tenantId));
      await db.delete(companies).where(eq(companies.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  async function seedTenantWithEmployee(name: string) {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name, status: 'active' }).returning();
    createdTenantIds.push(tenant.id);
    const [company] = await db
      .insert(companies)
      .values({ tenantId: tenant.id, name: `${name} Co`, legalName: `${name} Co Legal` })
      .returning();
    const [employee] = await db
      .insert(employees)
      .values({
        tenantId: tenant.id,
        companyId: company.id,
        employeeNo: 'EMP-ISO-1',
        firstName: 'Isolated',
        lastName: 'Employee',
        hireDate: '2025-01-01',
        status: 'ACTIVE',
      })
      .returning();
    return { tenant, company, employee };
  }

  it('tenant A cannot see tenant B’s employee via the action layer or a raw RLS-scoped query', async () => {
    const a = await seedTenantWithEmployee('Cross-Tenant Employee Test A');
    const b = await seedTenantWithEmployee('Cross-Tenant Employee Test B');

    const adminSessionA = testSession(a.tenant.id, a.company.id, { roles: ['ADMIN', 'HR_PAYROLL'] });

    const listResult = await executeAction('employee.list', {}, { session: adminSessionA });
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      const data = listResult.data as { employees: { id: string }[] };
      expect(data.employees.some((e) => e.id === b.employee.id)).toBe(false);
    }

    const getResult = await executeAction('employee.get', { employeeId: b.employee.id }, { session: adminSessionA });
    expect(getResult.ok).toBe(false);
    if (!getResult.ok) expect(getResult.error.code).toBe('NOT_FOUND');

    const rawRows = await withTenantContext({ tenantId: a.tenant.id, companyId: a.company.id }, async (db) =>
      db.select().from(employees),
    );
    expect(rawRows).toHaveLength(1);
    expect(rawRows[0]?.id).toBe(a.employee.id);
    expect(rawRows.some((row) => row.id === b.employee.id)).toBe(false);
  });

  it('company A cannot see company B’s employee within the same tenant', async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Cross-Company Employee Test Tenant', status: 'active' }).returning();
    createdTenantIds.push(tenant.id);
    const [companyA] = await db
      .insert(companies)
      .values({ tenantId: tenant.id, name: 'Company A', legalName: 'Company A Legal' })
      .returning();
    const [companyB] = await db
      .insert(companies)
      .values({ tenantId: tenant.id, name: 'Company B', legalName: 'Company B Legal' })
      .returning();
    const [employeeB] = await db
      .insert(employees)
      .values({
        tenantId: tenant.id,
        companyId: companyB.id,
        employeeNo: 'EMP-ISO-B',
        firstName: 'Company B',
        lastName: 'Employee',
        hireDate: '2025-01-01',
        status: 'ACTIVE',
      })
      .returning();

    const adminSessionA = testSession(tenant.id, companyA.id, { roles: ['ADMIN', 'HR_PAYROLL'] });

    const listResult = await executeAction('employee.list', {}, { session: adminSessionA });
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      const data = listResult.data as { employees: { id: string }[] };
      expect(data.employees.some((e) => e.id === employeeB.id)).toBe(false);
    }

    const getResult = await executeAction('employee.get', { employeeId: employeeB.id }, { session: adminSessionA });
    expect(getResult.ok).toBe(false);
    if (!getResult.ok) expect(getResult.error.code).toBe('NOT_FOUND');

    const rawRowsForA = await withTenantContext({ tenantId: tenant.id, companyId: companyA.id }, async (db) =>
      db.select().from(employees).where(eq(employees.tenantId, tenant.id)),
    );
    expect(rawRowsForA).toHaveLength(0);
  });
});
