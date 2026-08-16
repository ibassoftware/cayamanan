import { z } from 'zod';

/**
 * Schema-constrained working memory for Missy (see the header comment on
 * `MISSY_WORKING_MEMORY_OPTIONS` in `./missy-agent.ts` for the enabled/disabled decision and
 * scope choice — this file only owns the shape).
 *
 * Mastra's default (what shipped before this file existed) was an unconfigured, free-text
 * personal-assistant template — "First Name / Last Name / Location / Occupation / Interests /
 * Goals / Events / Facts / Projects" — which is the wrong product for an HRIS, and, being
 * free text, constrained nothing: the model went on to invent its own extra headers
 * ("Conversation Context", "Current Request") and used them to cache a snapshot of org data
 * (department/position lists) that goes stale the moment someone renames a position.
 * `schema` (mutually exclusive with `template` — see `SchemaWorkingMemory` in
 * `@mastra/core`'s `memory/types.d.ts`) makes an invented section a validation failure
 * instead of merely a discouraged one.
 *
 * Deliberately excluded, and why:
 * - Any list of records, or any field value (names, addresses, statuses, etc.) — that is
 *   domain data with one authoritative source, the tools that read it live. Caching it here
 *   duplicates it in a store nothing keeps in sync, which is exactly the staleness hazard
 *   this schema exists to close off. `MISSY_INSTRUCTIONS` (missy-agent.ts) backs this up at
 *   the prompt level: working memory records *what we are doing*, never *what the data says*.
 * - Salary, bank details, government ids, or any other statutory/payroll field — CLAUDE.md
 *   forbids the model from touching these at all; they must never even transit through a
 *   store as loosely governed as this one (see the scope-choice comment on why "loosely
 *   governed" is the right word).
 * - A running summary of the conversation — `lastMessages: 40` in `missy-agent.ts` already
 *   keeps the actual conversation; a second, model-authored paraphrase of it is a duplicate
 *   with its own drift risk, not a new capability.
 * - A human-readable label alongside `focus` (e.g. the employee's name) — considered and
 *   rejected. It would help a human skim the raw content, but buys the *model* nothing:
 *   resolving "their" only needs the id, and CLAUDE.md's guardrail means Missy must re-fetch
 *   the record before saying anything substantive about it anyway, so a cached name is never
 *   authoritative — only a second, unaudited copy of PII in a table with no RLS. Omitted.
 */
export const MISSY_FOCUS_ENTITY_TYPES = [
  'employee',
  'user',
  'department',
  'position',
  'location',
  'costCenter',
] as const;

export type MissyFocusEntityType = (typeof MISSY_FOCUS_ENTITY_TYPES)[number];

export const missyWorkingMemorySchema = z
  .object({
    focus: z
      .object({
        entityType: z
          .enum(MISSY_FOCUS_ENTITY_TYPES)
          .describe('Which kind of record the user is currently working on.'),
        entityId: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "The record's own id, exactly as returned by a tool call earlier this conversation — " +
              'never invented, and never a name or other field value.',
          ),
      })
      .strict()
      .nullable()
      .optional()
      .describe(
        'The single record the user is currently working on — e.g. after "open Maria Santos", so ' +
          '"now set their government IDs" resolves without asking again. Holds only a type and an ' +
          'opaque id, never a name or any field value: this is a pointer, not a cache, so always ' +
          're-fetch the record with a tool before saying anything about it. Set to null once the ' +
          'user moves on to something unrelated.',
      ),
    activeTask: z
      .object({
        summary: z
          .string()
          .min(1)
          .max(240)
          .describe(
            'One short line naming the multi-step task and its next step, e.g. "Onboarding: ' +
              'employee created, next set government IDs, then link user account."',
          ),
      })
      .strict()
      .nullable()
      .optional()
      .describe(
        'An in-progress task that spans more than one turn (e.g. create an employee, then set ' +
          'their government IDs, then link their user account), so the sequence survives even if ' +
          'the conversation runs long. Not a transcript and not a summary of what was said — only ' +
          'enough to resume the next step. Set to null once the task is finished or abandoned.',
      ),
  })
  .strict()
  .describe(
    "Missy's working memory: what we are doing, never what the data says. Department/position/" +
      'employee lists, field values, salary, bank details and government IDs never belong here — ' +
      'answer those from a tool call every time, even if the same question was answered earlier ' +
      'this conversation, because the underlying data can change between turns.',
  );

export type MissyWorkingMemory = z.infer<typeof missyWorkingMemorySchema>;
