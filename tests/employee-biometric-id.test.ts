import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

describe('employee.biometricId', () => {
  let tenantId: string;
  let companyId: string;
  let hrSession: ReturnType<typeof testSession>;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Biometric Id Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Biometric Id Test Co', legalName: 'Biometric Id Test Co Legal' })
      .returning();
    companyId = company.id;
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('two employees in the same company cannot share a biometric id, but both may have none', async () => {
    const first = await executeAction(
      'employee.create',
      { employeeNo: 'BIO-EMP-1', firstName: 'First', lastName: 'Employee', hireDate: '2025-01-01', biometricId: 'DEVICE-001' },
      { session: hrSession },
    );
    expect(first.ok).toBe(true);

    const duplicateOnCreate = await executeAction(
      'employee.create',
      { employeeNo: 'BIO-EMP-2', firstName: 'Second', lastName: 'Employee', hireDate: '2025-01-01', biometricId: 'DEVICE-001' },
      { session: hrSession },
    );
    expect(duplicateOnCreate.ok).toBe(false);
    if (!duplicateOnCreate.ok) {
      expect(duplicateOnCreate.error.code).toBe('VALIDATION_ERROR');
      expect(duplicateOnCreate.error.field).toBe('biometricId');
    }

    // No biometricId at all — two employees with NULL must not collide.
    const noBiometricA = await executeAction(
      'employee.create',
      { employeeNo: 'BIO-EMP-3', firstName: 'Third', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(noBiometricA.ok).toBe(true);

    const noBiometricB = await executeAction(
      'employee.create',
      { employeeNo: 'BIO-EMP-4', firstName: 'Fourth', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(noBiometricB.ok).toBe(true);
    if (!noBiometricB.ok) return;

    // Rejected via employee.update too, not just at create time.
    const updateDuplicate = await executeAction(
      'employee.update',
      { employeeId: (noBiometricB.data as { id: string }).id, biometricId: 'DEVICE-001' },
      { session: hrSession },
    );
    expect(updateDuplicate.ok).toBe(false);
    if (!updateDuplicate.ok) {
      expect(updateDuplicate.error.code).toBe('VALIDATION_ERROR');
      expect(updateDuplicate.error.field).toBe('biometricId');
    }

    const detail = await executeAction(
      'employee.get',
      { employeeId: (noBiometricB.data as { id: string }).id },
      { session: hrSession },
    );
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      expect((detail.data as { biometricId: string | null }).biometricId).toBeNull();
    }
  });
});
