import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { chatAttachments } from '../schema';

const attachmentSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

// Metadata only, own attachments only — the explicit column list below never selects
// `content`, so there is no code path in this action that can leak file text (schema.ts's
// header comment: the model, and this list, only ever see filename/size/row-count-shaped
// metadata, never the rows themselves).
export const listAttachmentsAction = defineAction({
  id: 'ai.listAttachments',
  title: 'List my staged chat attachments',
  input: z.object({}).strict(),
  output: z.object({ attachments: z.array(attachmentSchema) }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'self',
  toolExposed: false,
  async handler(_input, ctx) {
    const rows = await ctx.db
      .select({
        id: chatAttachments.id,
        filename: chatAttachments.filename,
        mimeType: chatAttachments.mimeType,
        byteSize: chatAttachments.byteSize,
        createdAt: chatAttachments.createdAt,
        expiresAt: chatAttachments.expiresAt,
      })
      .from(chatAttachments)
      .where(
        and(
          eq(chatAttachments.tenantId, ctx.tenantId),
          eq(chatAttachments.companyId, ctx.companyId),
          eq(chatAttachments.userId, ctx.userId ?? ''),
          // Expired rows are only reaped opportunistically (deleteExpiredAttachments,
          // called from ai.createAttachment) — until that next runs, this filter is what
          // keeps a stale row from ever being listable.
          gt(chatAttachments.expiresAt, ctx.now),
        ),
      )
      .orderBy(desc(chatAttachments.createdAt))
      .limit(50);

    return {
      attachments: rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      })),
    };
  },
});
