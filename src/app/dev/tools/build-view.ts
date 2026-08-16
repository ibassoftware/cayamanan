// Server-only data assembly for the dev-only "tools available to me" panel
// (docs/plan/03-missy-foundation.md: "A dev-only 'tools available to me' panel lists the
// tools the current role resolves to"). This file owns the two real sources of truth —
// `buildActionTools` (src/mastra/tools/action-tool-bridge.ts) for *which* tools the
// caller's role+scope resolves to, and `z.toJSONSchema` (the same methodology as
// tests/missy-tool-payload.test.ts) for the schema payload figure — and never
// re-implements either. Nothing here widens what a role may see: every view below is
// built by calling `buildActionTools` with the *viewer's own* verified session, exactly
// as the chat route does, so a tool the viewer's role could not call is never present in
// the data this returns.
import { z } from 'zod';

import '@/modules/system/actions/register';
import '@/modules/identity/actions/register';
import '@/modules/ai/actions/register';
import '@/modules/ui/actions/register';
import '@/modules/org/actions/register';
import '@/modules/employee/actions/register';

import { executeAction, getAction, type Role, type VerifiedSession } from '@/platform/actions';
import { buildActionTools, CATALOG_FIND_TOOL_ID } from '@/mastra/tools/action-tool-bridge';
import { MODULE_ACTION_SCOPES } from '@/lib/chat/tool-scope';

export interface ToolFieldRow {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
}

export interface DevToolEntry {
  id: string;
  module: string;
  title: string;
  description: string;
  risk: 'ordinary' | 'high';
  read: boolean;
  scope: 'company' | 'self';
  requiresConfirmation: boolean;
  fields: ToolFieldRow[];
}

export interface DevToolModuleGroup {
  module: string;
  tools: DevToolEntry[];
}

export interface DevToolsView {
  key: string;
  label: string;
  toolCount: number;
  payloadChars: number;
  modules: DevToolModuleGroup[];
}

export interface DevToolsData {
  viewer: { email: string; name: string; roles: Role[] };
  /** Raw `MISSY_TOOL_SCOPING` env value, for display only — never used to decide what
   * this page itself computes (see `withForcedScoping` below). */
  envScoping: string;
  unscoped: DevToolsView;
  scopedByModule: Record<string, DevToolsView>;
  moduleOptions: { value: string; label: string }[];
}

/** `action.id`'s module prefix, e.g. `'org.updateDepartment'` -> `'org'`. Deliberately
 * re-implemented here (not imported) — the bridge's own copy is a private, unexported
 * function, same discipline as this file's other small pure helpers. */
function moduleOfActionId(actionId: string): string {
  return actionId.split('.')[0] ?? actionId;
}

const MODULE_LABELS: Readonly<Record<string, string>> = {
  employees: 'Employees (/app/employees)',
  org: 'Organization (/app/org/*)',
  me: 'My profile (/app/me/*)',
  settings: 'Settings (/app/settings/*)',
};

function moduleLabel(key: string): string {
  return MODULE_LABELS[key] ?? key;
}

// Minimal shape of the draft-2020-12 JSON Schema `z.toJSONSchema` emits — just enough to
// render field name/type/required/description readably, generic over whatever a later
// slice's action input looks like (never hand-maintained per action).
interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: unknown[];
  anyOf?: JsonSchemaNode[];
  format?: string;
  description?: string;
}

function describeSchemaNode(node: JsonSchemaNode | undefined): string {
  if (!node) return 'unknown';
  if (node.enum) return `enum (${node.enum.map(String).join(', ')})`;
  if (node.anyOf) return node.anyOf.map(describeSchemaNode).join(' | ');
  if (node.type === 'array') return `array of ${describeSchemaNode(node.items)}`;
  if (node.type === 'object') return 'object';
  const base = Array.isArray(node.type) ? node.type.join(' | ') : (node.type ?? 'unknown');
  return node.format ? `${base} (${node.format})` : base;
}

/**
 * Field name / type / required / description for one action's input schema — built so a
 * later slice's field `.describe()` calls (src/platform/fields.ts, in flight separately)
 * appear automatically: `z.toJSONSchema` already carries a field's `description` through
 * to this schema's `properties[name].description` with zero changes needed here.
 */
function schemaFieldRows(input: z.ZodType): ToolFieldRow[] {
  try {
    const schema = z.toJSONSchema(input) as JsonSchemaNode;
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    return Object.entries(properties).map(([name, node]) => ({
      name,
      type: describeSchemaNode(node),
      required: required.has(name),
      description: node.description ?? null,
    }));
  } catch {
    // Defensive only — every registered action's input is a plain zod object today, but
    // this page must never crash the whole registry view over one unusual schema.
    return [];
  }
}

const DEV_THREAD_PREFIX = 'dev-tools-panel';

function payloadChars(tools: Record<string, { id: string; description?: string; inputSchema?: unknown }>): number {
  let total = 0;
  for (const tool of Object.values(tools)) {
    const schemaJson = tool.inputSchema ? JSON.stringify(z.toJSONSchema(tool.inputSchema as z.ZodType)) : '';
    total += tool.id.length + (tool.description?.length ?? 0) + schemaJson.length;
  }
  return total;
}

function toDisplayTools(tools: ReturnType<typeof buildActionTools>): DevToolEntry[] {
  return Object.values(tools)
    .map((tool): DevToolEntry => {
      if (tool.id === CATALOG_FIND_TOOL_ID) {
        return {
          id: tool.id,
          module: 'catalog',
          title: 'Search the full catalog',
          description: tool.description ?? '',
          risk: 'ordinary',
          read: true,
          scope: 'company',
          requiresConfirmation: false,
          fields: schemaFieldRows(tool.inputSchema as z.ZodType),
        };
      }
      // Every non-catalog.find id offered by buildActionTools came from `listActions()`
      // filtered to `toolExposed && roles allowed` — so it is always still registered.
      const def = getAction(tool.id)!;
      return {
        id: def.id,
        module: moduleOfActionId(def.id),
        title: def.title,
        description: tool.description ?? def.title,
        risk: def.risk,
        read: def.read,
        scope: def.scope,
        requiresConfirmation: def.risk === 'high',
        fields: schemaFieldRows(tool.inputSchema as z.ZodType),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function groupByModule(entries: DevToolEntry[]): DevToolModuleGroup[] {
  const byModule = new Map<string, DevToolEntry[]>();
  for (const entry of entries) {
    const list = byModule.get(entry.module) ?? [];
    list.push(entry);
    byModule.set(entry.module, list);
  }
  return Array.from(byModule.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, moduleTools]) => ({ module, tools: moduleTools }));
}

function buildView(
  session: VerifiedSession,
  key: string,
  label: string,
  options: Parameters<typeof buildActionTools>[2],
): DevToolsView {
  const tools = buildActionTools(session, `${DEV_THREAD_PREFIX}:${key}`, options);
  const entries = toDisplayTools(tools);
  return {
    key,
    label,
    toolCount: entries.length,
    payloadChars: payloadChars(tools),
    modules: groupByModule(entries),
  };
}

/**
 * Forces `buildActionTools`'s scoping mechanism on for the duration of `fn`, regardless
 * of `MISSY_TOOL_SCOPING` (currently pinned to `unscoped` in `.env` — see .env.example).
 * This page's whole purpose is to answer "what would scoping do here?", which requires
 * seeing the scoped view even while it's rolled back for real traffic. `buildActionTools`
 * itself is synchronous, so `fn` runs (and `process.env` is restored) within the same
 * synchronous tick — no concurrent request can observe the override.
 */
function withForcedScoping<T>(fn: () => T): T {
  const original = process.env.MISSY_TOOL_SCOPING;
  process.env.MISSY_TOOL_SCOPING = 'scoped';
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.MISSY_TOOL_SCOPING;
    else process.env.MISSY_TOOL_SCOPING = original;
  }
}

/**
 * Assembles every view this page renders for one viewer. Every tool in every view below
 * comes from `buildActionTools(session, ...)` called with that same viewer's own
 * `VerifiedSession` — there is no code path here that can surface a tool the viewer's own
 * role is not itself allowed to call (`executeAction`'s role check is the authorization
 * boundary either way; this only ever narrows the UX list further).
 */
export async function buildDevToolsData(session: VerifiedSession): Promise<DevToolsData> {
  const meResult = await executeAction('identity.me', {}, { session });
  // `executeAction` is untyped-by-id (it's a transport-agnostic dispatcher, not a typed
  // per-action call) — this shape mirrors identity.me's own `output` schema exactly
  // (src/modules/identity/actions/me.ts) for this read-only display purpose only.
  const viewer = meResult.ok
    ? (meResult.data as { email: string; name: string; roles: Role[] })
    : { email: '(unavailable)', name: '(unavailable)', roles: session.roles };

  const unscoped = buildView(session, 'unscoped', 'Unscoped — full role-allowed set', { unscoped: true });

  const moduleOptions = Object.keys(MODULE_ACTION_SCOPES).map((key) => ({ value: key, label: moduleLabel(key) }));

  const scopedByModule: Record<string, DevToolsView> = {};
  for (const { value: moduleKey, label } of moduleOptions) {
    scopedByModule[moduleKey] = withForcedScoping(() =>
      buildView(session, moduleKey, `Scoped — ${label}`, { screenContext: { module: moduleKey } }),
    );
  }

  return {
    viewer,
    envScoping: process.env.MISSY_TOOL_SCOPING ?? '(unset — scoping is active by default whenever a screen context is supplied)',
    unscoped,
    scopedByModule,
    moduleOptions,
  };
}
