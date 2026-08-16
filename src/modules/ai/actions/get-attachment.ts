import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { getAttachmentContent } from '../service/attachments';

export const getAttachmentAction = defineAction({
  id: 'ai.getAttachment',
  title: 'Read a staged chat attachment',
  input: z.object({ attachmentId: z.string().uuid() }).strict(),
  output: z.object({
    filename: z.string(),
    mimeType: z.string(),
    content: z.string(),
  }),
  read: true,
  risk: 'ordinary',
  roles: ['ADMIN', 'HR_PAYROLL'],
  scope: 'self',
  // Not a Missy tool: this hands back a whole file's raw text, and (like
  // employee.importPreview's own reasoning) a file blob has no business in a tool-call
  // payload. This exists so the employee-import wizard can resolve an `attachmentId` the
  // composer already staged into the text employee.importPreview/importCommit re-parse.
  toolExposed: false,
  async handler(input, ctx) {
    const attachment = await getAttachmentContent({ db: ctx.db, userId: ctx.userId ?? '' }, input.attachmentId);
    // Same collapsed-null discipline `getAttachmentContent` itself documents: "not yours"
    // and "doesn't exist" must be indistinguishable, or the id becomes an enumeration
    // oracle. A single generic message here, not a more specific one per cause.
    if (!attachment) {
      throw new ActionError('NOT_FOUND', 'Attachment not found.');
    }
    return { filename: attachment.filename, mimeType: attachment.mimeType, content: attachment.content };
  },
});
