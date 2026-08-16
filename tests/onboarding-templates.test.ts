import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';
import { companies, tenants } from '@/modules/org/schema';
import { onboardingTemplates } from '@/modules/employee/schema';
import { executeAction } from '@/platform/actions';
import { getBootstrapDb } from '@/platform/db';
import { testSession } from './helpers/session';

describe('onboarding checklist templates', () => {
  let tenantId: string;
  let companyId: string;
  let hrSession: ReturnType<typeof testSession>;
  let employeeSession: ReturnType<typeof testSession>;
  let employeeAId: string;
  let employeeBId: string;

  beforeAll(async () => {
    const db = getBootstrapDb();
    const [tenant] = await db.insert(tenants).values({ name: 'Onboarding Templates Test Tenant', status: 'active' }).returning();
    tenantId = tenant.id;
    const [company] = await db
      .insert(companies)
      .values({ tenantId, name: 'Onboarding Templates Test Co', legalName: 'Onboarding Templates Test Co Legal' })
      .returning();
    companyId = company.id;
    hrSession = testSession(tenantId, companyId, { roles: ['HR_PAYROLL'] });
    employeeSession = testSession(tenantId, companyId, { roles: ['EMPLOYEE'] });

    const empA = await executeAction(
      'employee.create',
      { employeeNo: 'ONB-EMP-A', firstName: 'Alpha', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(empA.ok).toBe(true);
    if (!empA.ok) return;
    employeeAId = (empA.data as { id: string }).id;

    const empB = await executeAction(
      'employee.create',
      { employeeNo: 'ONB-EMP-B', firstName: 'Beta', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: hrSession },
    );
    expect(empB.ok).toBe(true);
    if (!empB.ok) return;
    employeeBId = (empB.data as { id: string }).id;
  });

  afterAll(async () => {
    const db = getBootstrapDb();
    await db.delete(companies).where(eq(companies.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('creates a template, lists it, updates it and rejects a duplicate name', async () => {
    const created = await executeAction(
      'onboarding.createTemplate',
      {
        name: 'Standard Rank-and-File',
        description: 'Default checklist for new non-managerial hires.',
        items: [
          { requirement: 'SSS E-1 form' },
          { requirement: 'NBI Clearance', notes: 'Must be recent (within 6 months).' },
        ],
      },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const templateId = (created.data as { id: string }).id;

    const duplicate = await executeAction(
      'onboarding.createTemplate',
      { name: 'Standard Rank-and-File', items: [{ requirement: 'Anything' }] },
      { session: hrSession },
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('VALIDATION_ERROR');

    const listed = await executeAction('onboarding.listTemplates', {}, { session: hrSession });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const templates = (listed.data as { templates: { id: string; items: unknown[] }[] }).templates;
      const found = templates.find((t) => t.id === templateId);
      expect(found?.items).toHaveLength(2);
    }

    const updated = await executeAction(
      'onboarding.updateTemplate',
      { templateId, description: 'Updated description', items: [{ requirement: 'SSS E-1 form' }] },
      { session: hrSession },
    );
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      const data = updated.data as { description: string | null; items: unknown[] };
      expect(data.description).toBe('Updated description');
      expect(data.items).toHaveLength(1);
    }
  });

  it('at most one template per company is default — setting a new default unsets the old one', async () => {
    const first = await executeAction(
      'onboarding.createTemplate',
      { name: 'Default Template A', isDefault: true, items: [{ requirement: 'Item A' }] },
      { session: hrSession },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await executeAction(
      'onboarding.createTemplate',
      { name: 'Default Template B', isDefault: true, items: [{ requirement: 'Item B' }] },
      { session: hrSession },
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const listed = await executeAction('onboarding.listTemplates', {}, { session: hrSession });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const templates = (listed.data as { templates: { id: string; isDefault: boolean }[] }).templates;
      const defaults = templates.filter((t) => t.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0]?.id).toBe((second.data as { id: string }).id);
    }
  });

  it('applying a template creates one requirement per item, is idempotent on a second apply, and skips only a pre-existing requirement', async () => {
    const template = await executeAction(
      'onboarding.createTemplate',
      {
        name: 'Apply Test Template',
        items: [{ requirement: 'Apply Test - SSS' }, { requirement: 'Apply Test - PhilHealth' }],
      },
      { session: hrSession },
    );
    expect(template.ok).toBe(true);
    if (!template.ok) return;
    const templateId = (template.data as { id: string }).id;

    // employeeBId already has one of the two requirements from a prior manual setRequirement.
    const preexisting = await executeAction(
      'employee.setRequirement',
      { employeeId: employeeBId, requirement: 'Apply Test - SSS' },
      { session: hrSession },
    );
    expect(preexisting.ok).toBe(true);

    const firstApply = await executeAction(
      'employee.applyOnboardingTemplate',
      { employeeId: employeeBId, templateId },
      { session: hrSession },
    );
    expect(firstApply.ok).toBe(true);
    if (firstApply.ok) {
      const data = firstApply.data as { created: string[]; skipped: string[] };
      expect(data.created).toEqual(['Apply Test - PhilHealth']);
      expect(data.skipped).toEqual(['Apply Test - SSS']);
    }

    // Applying to a fresh employee (employeeAId) creates both items.
    const applyFresh = await executeAction(
      'employee.applyOnboardingTemplate',
      { employeeId: employeeAId, templateId },
      { session: hrSession },
    );
    expect(applyFresh.ok).toBe(true);
    if (applyFresh.ok) {
      const data = applyFresh.data as { created: string[]; skipped: string[] };
      expect(data.created.sort()).toEqual(['Apply Test - PhilHealth', 'Apply Test - SSS'].sort());
      expect(data.skipped).toEqual([]);
    }

    // Applying a second time to the same (now fully-checklisted) employee creates nothing.
    const secondApply = await executeAction(
      'employee.applyOnboardingTemplate',
      { employeeId: employeeAId, templateId },
      { session: hrSession },
    );
    expect(secondApply.ok).toBe(true);
    if (secondApply.ok) {
      const data = secondApply.data as { created: string[]; skipped: string[] };
      expect(data.created).toEqual([]);
      expect(data.skipped.sort()).toEqual(['Apply Test - PhilHealth', 'Apply Test - SSS'].sort());
    }
  });

  it('removes a template by name', async () => {
    const created = await executeAction(
      'onboarding.createTemplate',
      { name: 'Removable Template', items: [{ requirement: 'Removable Item' }] },
      { session: hrSession },
    );
    expect(created.ok).toBe(true);

    const removed = await executeAction('onboarding.removeTemplate', { name: 'Removable Template' }, { session: hrSession });
    expect(removed.ok).toBe(true);

    const listed = await executeAction('onboarding.listTemplates', {}, { session: hrSession });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const templates = (listed.data as { templates: { name: string }[] }).templates;
      expect(templates.some((t) => t.name === 'Removable Template')).toBe(false);
    }
  });

  it('an EMPLOYEE caller is refused every write', async () => {
    const create = await executeAction(
      'onboarding.createTemplate',
      { name: 'Employee Attempt', items: [{ requirement: 'X' }] },
      { session: employeeSession },
    );
    expect(create.ok).toBe(false);
    if (!create.ok) expect(create.error.code).toBe('FORBIDDEN');

    const update = await executeAction(
      'onboarding.updateTemplate',
      { templateId: crypto.randomUUID(), description: 'x' },
      { session: employeeSession },
    );
    expect(update.ok).toBe(false);
    if (!update.ok) expect(update.error.code).toBe('FORBIDDEN');

    const remove = await executeAction(
      'onboarding.removeTemplate',
      { templateId: crypto.randomUUID() },
      { session: employeeSession },
    );
    expect(remove.ok).toBe(false);
    if (!remove.ok) expect(remove.error.code).toBe('FORBIDDEN');

    const apply = await executeAction(
      'employee.applyOnboardingTemplate',
      { employeeId: employeeAId, templateId: crypto.randomUUID() },
      { session: employeeSession },
    );
    expect(apply.ok).toBe(false);
    if (!apply.ok) expect(apply.error.code).toBe('FORBIDDEN');
  });
});

describe('onboarding template tenant isolation', () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    if (createdTenantIds.length === 0) return;
    const db = getBootstrapDb();
    for (const tenantId of createdTenantIds) {
      await db.delete(onboardingTemplates).where(eq(onboardingTemplates.tenantId, tenantId));
      await db.delete(companies).where(eq(companies.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  it('a template from another tenant cannot be read via listTemplates or applied', async () => {
    const db = getBootstrapDb();

    const [tenantA] = await db.insert(tenants).values({ name: 'Onboarding Iso Tenant A', status: 'active' }).returning();
    createdTenantIds.push(tenantA.id);
    const [companyA] = await db
      .insert(companies)
      .values({ tenantId: tenantA.id, name: 'Onboarding Iso Co A', legalName: 'Onboarding Iso Co A Legal' })
      .returning();

    const [tenantB] = await db.insert(tenants).values({ name: 'Onboarding Iso Tenant B', status: 'active' }).returning();
    createdTenantIds.push(tenantB.id);
    const [companyB] = await db
      .insert(companies)
      .values({ tenantId: tenantB.id, name: 'Onboarding Iso Co B', legalName: 'Onboarding Iso Co B Legal' })
      .returning();

    const sessionA = testSession(tenantA.id, companyA.id, { roles: ['ADMIN', 'HR_PAYROLL'] });
    const sessionB = testSession(tenantB.id, companyB.id, { roles: ['ADMIN', 'HR_PAYROLL'] });

    const templateB = await executeAction(
      'onboarding.createTemplate',
      { name: 'Tenant B Template', items: [{ requirement: 'B Item' }] },
      { session: sessionB },
    );
    expect(templateB.ok).toBe(true);
    if (!templateB.ok) return;
    const templateBId = (templateB.data as { id: string }).id;

    const listedByA = await executeAction('onboarding.listTemplates', {}, { session: sessionA });
    expect(listedByA.ok).toBe(true);
    if (listedByA.ok) {
      const templates = (listedByA.data as { templates: { id: string }[] }).templates;
      expect(templates.some((t) => t.id === templateBId)).toBe(false);
    }

    const employeeA = await executeAction(
      'employee.create',
      { employeeNo: 'ISO-EMP-A', firstName: 'Iso', lastName: 'Employee', hireDate: '2025-01-01' },
      { session: sessionA },
    );
    expect(employeeA.ok).toBe(true);
    if (!employeeA.ok) return;
    const employeeAId = (employeeA.data as { id: string }).id;

    const applyResult = await executeAction(
      'employee.applyOnboardingTemplate',
      { employeeId: employeeAId, templateId: templateBId },
      { session: sessionA },
    );
    expect(applyResult.ok).toBe(false);
    if (!applyResult.ok) expect(applyResult.error.code).toBe('NOT_FOUND');
  });
});
