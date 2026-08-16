// Records that a tool ran — metadata only (03-missy-foundation.md: "never inputs/outputs
// containing PII or money"). Called by the tool bridge after every tool execution,
// success or failure; never logs/stores the action's input or output.
import type { VerifiedSession } from '@/platform/actions';
import { withTenantContext } from '@/platform/db';
import { aiToolInvocations } from '../schema';

export interface RecordToolInvocationParams {
  session: VerifiedSession;
  threadId: string;
  actionId: string;
  status: 'success' | 'confirmation_required' | 'error';
  durationMs: number;
  errorCode: string | null;
}

export async function recordToolInvocation(params: RecordToolInvocationParams): Promise<void> {
  await withTenantContext({ tenantId: params.session.tenantId, companyId: params.session.companyId }, async (tenantDb) => {
    await tenantDb.insert(aiToolInvocations).values({
      tenantId: params.session.tenantId,
      companyId: params.session.companyId,
      userId: params.session.userId,
      threadId: params.threadId,
      actionId: params.actionId,
      status: params.status,
      durationMs: params.durationMs,
      errorCode: params.errorCode,
    });
  });
}
