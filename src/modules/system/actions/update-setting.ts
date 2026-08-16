import { z } from 'zod';

import { defineAction } from '@/platform/actions';
import { ActionError } from '@/platform/errors';
import { isoDate } from '@/platform/fields';
import { redact } from '@/platform/redact';
import { RESERVED_SETTING_KEYS, writeSettingRow } from '@/modules/system/service/settings-store';

const inputSchema = z.object({
  key: z.string().min(1).describe("Setting's unique key name."),
  value: z.unknown().describe('New value for this setting (any JSON).'),
  // Defaults to "today" (server time) if omitted — never client-trusted for anything
  // beyond a plain effective date.
  effectiveFrom: isoDate().describe('Date the new value takes effect; defaults to today.').optional(),
});

const outputSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  effectiveFrom: z.string(),
});

/**
 * Closes the currently-open row for this key (sets `effectiveTo`) and inserts a new
 * open-ended row, inside one transaction. High-risk: audited with before/after.
 *
 * The actual read-then-close-then-insert write (and its concurrency handling) lives in
 * `settings-store.ts`'s `writeSettingRow`, shared with `system.setOpenAiKey` — see that
 * function's own comment for the race this action used to spell out inline.
 */
export const updateSettingAction = defineAction({
  id: 'system.updateSetting',
  title: 'Update system setting',
  input: inputSchema,
  output: outputSchema,
  read: false,
  risk: 'high',
  roles: ['ADMIN'],
  scope: 'company',
  // Slice 03: the vehicle for the confirmation flow ("change the system setting X to Y")
  // — high-risk and tool-exposed, so the bridge routes every call through a confirmation
  // card rather than executing directly. `value` is arbitrary jsonb; `redact()` strips
  // any key/token that looks sensitive rather than trusting the caller's key name.
  toolExposed: true,
  toolDescription: 'Propose a change to a system setting (admin only) — requires user confirmation before it applies.',
  confirmationPreview(input) {
    return { key: input.key, value: redact(input.value), effectiveFrom: input.effectiveFrom ?? null };
  },
  async handler(input, ctx) {
    if (RESERVED_SETTING_KEYS.has(input.key)) {
      // The OpenAI key (and any future secret stored the same way) is written only
      // through its own dedicated action, which controls the exact value shape
      // (ciphertext + last4) — never this generic, arbitrary-JSON path.
      throw new ActionError(
        'VALIDATION_ERROR',
        `"${input.key}" is managed through its own dedicated action, not system.updateSetting.`,
        { field: 'key' },
      );
    }

    const { created, previous } = await writeSettingRow(ctx, input.key, input.value, input.effectiveFrom);

    ctx.audit({
      entityType: 'system_settings',
      entityId: created.id,
      before: previous ? { key: previous.key, value: previous.value } : null,
      after: { key: created.key, value: created.value },
    });

    return { key: created.key, value: created.value, effectiveFrom: created.effectiveFrom };
  },
});
