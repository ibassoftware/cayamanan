import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { chatAttachments } from '../schema';
import { MAX_ATTACHMENT_BASE64_LENGTH, deleteExpiredAttachments, validateAttachmentUpload } from '../service/attachments';

// 1 hour — short-lived on purpose (schema.ts's header comment): this table holds
// unredacted employee PII a user pasted in, and nothing in this app cleans it up on a
// timer (there is no scheduler), only opportunistically from this handler.
const ATTACHMENT_TTL_MS = 60 * 60 * 1000;

export const createAttachmentAction = defineAction({
  id: 'ai.createAttachment',
  title: 'Attach a file to a Missy conversation',
  input: z
    .object({
      filename: z.string().min(1).max(255),
      // The `.max()` is the load-bearing half: it rejects an oversized payload at the
      // schema boundary, before `validateAttachmentUpload` decodes anything into a
      // second buffer — see MAX_ATTACHMENT_BASE64_LENGTH for why the decoded-size check
      // alone is not a limit.
      contentBase64: z.string().min(1).max(MAX_ATTACHMENT_BASE64_LENGTH, 'File is too large.'),
    })
    .strict(),
  output: z.object({
    id: z.string().uuid(),
    filename: z.string(),
    byteSize: z.number().int(),
    rowCount: z.number().int(),
  }),
  read: false,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'self',
  // The client creates these directly from the composer's file picker — never the
  // model, for the same reason employee.importPreview/uploadDocument never are: a raw
  // file blob has no business in a tool-call payload. The whole point of this staging
  // table is that the model only ever sees the filename/size/row count this returns.
  toolExposed: false,
  async handler(input, ctx) {
    const validated = validateAttachmentUpload({ filename: input.filename, contentBase64: input.contentBase64 });

    // Opportunistic cleanup — see deleteExpiredAttachments's own comment for why this,
    // and only this, is what stands in for a scheduler in this app.
    await deleteExpiredAttachments(ctx.db, ctx.now);

    const expiresAt = new Date(ctx.now.getTime() + ATTACHMENT_TTL_MS);

    const [created] = await ctx.db
      .insert(chatAttachments)
      .values({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        userId: ctx.userId ?? '',
        filename: validated.filename,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        content: validated.content,
        expiresAt,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
      .returning();

    return {
      id: created.id,
      filename: created.filename,
      byteSize: created.byteSize,
      rowCount: validated.rowCount,
    };
  },
});
