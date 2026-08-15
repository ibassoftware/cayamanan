// Durable trail of login attempts (docs/plan/02-identity-auth.md: "this table is the
// durable trail"; Redis in rate-limit.ts is what actually decides lockout). Failure to
// record here must never block a login — it's forensics, not an authorization gate.
import { withNoTenantContext } from '@/platform/db';
import { loginAttempts } from '@/modules/identity/schema';

export async function recordLoginAttempt(
  emailHash: string,
  success: boolean,
  ipHash: string | null,
): Promise<void> {
  try {
    await withNoTenantContext(async (noTenantDb) => {
      await noTenantDb.insert(loginAttempts).values({ emailHash, success, ipHash });
    });
  } catch (error) {
    console.error('[identity] failed to record login attempt:', (error as Error).message);
  }
}
