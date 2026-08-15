import 'dotenv/config';

import { and, eq } from 'drizzle-orm';

import { companies, tenants } from '@/modules/org/schema';
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
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
