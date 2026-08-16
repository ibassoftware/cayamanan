import 'dotenv/config';

import { and, eq } from 'drizzle-orm';

import { companies, departments, locations, positions, tenants } from '@/modules/org/schema';
import { userRoles, users } from '@/modules/identity/schema';
import { getBootstrapDb } from '@/platform/db';
import { hashPassword } from '@/modules/identity/service/password';
import { normalizeEmail } from '@/modules/identity/service/hash';

// Idempotent, in two independent stages so re-running after slice 02 lands on a
// database that already has the slice-01 tenant/company still seeds the new users:
//   1. tenant + company — created only if none exists yet (unchanged from slice 01).
//   2. one seeded user per fixed role — created only if that email doesn't exist yet
//      for the resolved tenant, regardless of whether stage 1 ran this time.
const SEED_USERS = [
  { email: 'admin@cayamanan.dev', name: 'Ada Min', password: 'Admin!2345', role: 'ADMIN' as const },
  { email: 'hrpayroll@cayamanan.dev', name: 'Hetty Payroll', password: 'HrPayroll!2345', role: 'HR_PAYROLL' as const },
  { email: 'employee@cayamanan.dev', name: 'Emma Ployee', password: 'Employee!2345', role: 'EMPLOYEE' as const },
];

async function main() {
  const db = getBootstrapDb();

  const tenantRows = await db.select().from(tenants).limit(2);
  if (tenantRows.length > 1) {
    throw new Error('More than one tenant exists; seed.ts only knows how to seed the single-tenant MVP shape.');
  }
  let tenant = tenantRows[0];

  let company: typeof companies.$inferSelect;
  if (!tenant) {
    [tenant] = await db.insert(tenants).values({ name: 'Cayamanan Demo Tenant', status: 'active' }).returning();
    [company] = await db
      .insert(companies)
      .values({
        tenantId: tenant.id,
        name: 'Cayamanan Demo Company',
        legalName: 'Cayamanan Demo Company, Inc.',
        timezone: 'Asia/Manila',
        defaultCurrency: 'PHP',
      })
      .returning();
    console.log(`Seeded tenant ${tenant.id} and company ${company.id}.`);
  } else {
    console.log(`Tenant ${tenant.id} already exists; skipping tenant/company seed.`);
    const [existingCompany] = await db
      .select()
      .from(companies)
      .where(eq(companies.tenantId, tenant.id))
      .limit(1);
    if (!existingCompany) {
      throw new Error(`Tenant ${tenant.id} has no company — cannot seed users without one.`);
    }
    company = existingCompany;
  }

  const seeded: string[] = [];
  for (const seedUser of SEED_USERS) {
    const email = normalizeEmail(seedUser.email);
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), eq(users.email, email)))
      .limit(1);
    if (existingUser) {
      console.log(`  Skipped ${email} — already exists.`);
      continue;
    }

    const passwordHash = await hashPassword(seedUser.password);
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        companyId: company.id,
        email,
        name: seedUser.name,
        passwordHash,
        status: 'ACTIVE',
        // false (not the identity.createUser default of true): these are demo/QA
        // credentials meant to be usable immediately, not a real new hire's first login.
        mustChangePassword: false,
      })
      .returning();

    await db.insert(userRoles).values({ tenantId: tenant.id, userId: user.id, role: seedUser.role });
    seeded.push(`  ${seedUser.email} / ${seedUser.password} / ${seedUser.role}`);
  }

  if (seeded.length > 0) {
    console.log('Seeded users (email / password / role) — demo credentials, not for production:');
    for (const line of seeded) console.log(line);
  }

  await seedOrgReferenceData(db, tenant.id, company.id);
}

// Idempotent (same shape as SEED_USERS above): a small, realistic set of departments
// (one level of nesting, to exercise the tree), positions and locations for slice 04
// (04-organization-employees.md) — enough for the UI/QA to search, filter and assign
// against without a blank-slate screen. Skips anything whose `code` already exists for
// this company.
const SEED_DEPARTMENTS: { code: string; name: string; parentCode: string | null }[] = [
  { code: 'EXEC', name: 'Executive', parentCode: null },
  { code: 'FIN', name: 'Finance', parentCode: 'EXEC' },
  { code: 'HR', name: 'Human Resources', parentCode: 'EXEC' },
  { code: 'ENG', name: 'Engineering', parentCode: 'EXEC' },
];

const SEED_POSITIONS = [
  { code: 'CEO', title: 'Chief Executive Officer' },
  { code: 'FIN-MGR', title: 'Finance Manager' },
  { code: 'ACCT', title: 'Accountant' },
  { code: 'HR-MGR', title: 'HR Manager' },
  { code: 'SWE', title: 'Software Engineer' },
];

const SEED_LOCATIONS = [
  { code: 'MNL-HQ', name: 'Manila Head Office', timezone: 'Asia/Manila' },
  { code: 'CEB', name: 'Cebu Office', timezone: 'Asia/Manila' },
];

async function seedOrgReferenceData(db: ReturnType<typeof getBootstrapDb>, tenantId: string, companyId: string) {
  const codeByOrderedInsert = new Map<string, string>();
  let deptCount = 0;
  for (const dept of SEED_DEPARTMENTS) {
    const [existing] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.tenantId, tenantId), eq(departments.companyId, companyId), eq(departments.code, dept.code)))
      .limit(1);
    if (existing) {
      codeByOrderedInsert.set(dept.code, existing.id);
      continue;
    }
    const parentId = dept.parentCode ? (codeByOrderedInsert.get(dept.parentCode) ?? null) : null;
    const depth = parentId ? 1 : 0;
    const [created] = await db
      .insert(departments)
      .values({ tenantId, companyId, code: dept.code, name: dept.name, parentId, depth })
      .returning({ id: departments.id });
    codeByOrderedInsert.set(dept.code, created.id);
    deptCount += 1;
  }

  let positionCount = 0;
  for (const position of SEED_POSITIONS) {
    const [existing] = await db
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.tenantId, tenantId), eq(positions.companyId, companyId), eq(positions.code, position.code)))
      .limit(1);
    if (existing) continue;
    await db.insert(positions).values({ tenantId, companyId, code: position.code, title: position.title });
    positionCount += 1;
  }

  let locationCount = 0;
  for (const location of SEED_LOCATIONS) {
    const [existing] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.tenantId, tenantId), eq(locations.companyId, companyId), eq(locations.code, location.code)))
      .limit(1);
    if (existing) continue;
    await db
      .insert(locations)
      .values({ tenantId, companyId, code: location.code, name: location.name, timezone: location.timezone });
    locationCount += 1;
  }

  if (deptCount + positionCount + locationCount > 0) {
    console.log(
      `Seeded org reference data: ${deptCount} department(s), ${positionCount} position(s), ${locationCount} location(s).`,
    );
  } else {
    console.log('Org reference data already present; skipping.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
