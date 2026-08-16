// The single action layer — §4.2. Every read and every mutation the UI and Missy can
// perform is a `defineAction()` entry here; the route (`/api/actions/[actionId]`) and
// Missy's tool registry (slice 03) are both thin callers of `executeAction`, never
// business logic of their own.
import type { ZodType } from 'zod';

import { auditLogs } from './schema/audit';
import { ActionError, type AppError, type ActionResult, err } from './errors';
import { redact } from './redact';
import { withTenantContext, type ScopedDb } from './db';

export type Role = 'ADMIN' | 'HR_PAYROLL' | 'EMPLOYEE';

export interface AuditEntry {
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
}

/**
 * A verified session, as resolved from the signed session cookie
 * (`src/modules/identity/service/session.ts` `resolveSessionFromCookie`) — every field
 * comes from a fresh DB read at request time, never from anything client-supplied
 * beyond the session id the cookie names. Nothing outside that resolution function
 * should construct one over an HTTP-reachable code path; tests are free to build one
 * directly (the same level of trust already extended to `getBootstrapDb()` in tests).
 */
export interface VerifiedSession {
  tenantId: string;
  companyId: string;
  userId: string;
  employeeId: string | null;
  roles: Role[];
  sessionId: string;
}

export interface ActionCtx {
  tenantId: string;
  companyId: string;
  userId: string | null;
  employeeId?: string | null;
  roles: Role[];
  /** The verified session's id, or `null` for the anonymous `identity.login` action. */
  sessionId: string | null;
  /**
   * Request IP/user-agent, as seen by the HTTP route — never client-body-supplied.
   * Used only by identity.login (to hash into `sessions`/`login_attempts`); `null` when
   * an action is called directly (tests, other non-HTTP callers) without a request.
   */
  ip: string | null;
  userAgent: string | null;
  requestId: string;
  now: Date;
  /** Transaction-scoped DB handle, valid only for the lifetime of this action call. */
  db: ScopedDb;
  /**
   * `risk: 'high'` handlers must call this exactly once with the changed fields before
   * returning. The registry writes the `audit_logs` row inside the same transaction;
   * the handler never writes to `audit_logs` itself.
   */
  audit(entry: AuditEntry): void;
  /**
   * `identity.login`/`identity.logout` call this exactly once to tell the HTTP route
   * what `Set-Cookie` to send: the signed cookie value to set a session, or `null` to
   * clear it. No other action should call this. `ActionResult` itself never carries
   * cookie data — this is a side channel the route reads via `ExecuteOptions.onSetCookie`.
   */
  setSessionCookie(token: string | null): void;
}

export interface DefineActionArgs<TInput, TOutput> {
  id: string;
  title: string;
  input: ZodType<TInput>;
  output: ZodType<TOutput>;
  read: boolean;
  risk: 'ordinary' | 'high';
  roles: Role[];
  /** 'self' actions are additionally expected to filter to ctx.employeeId (slice 04+). */
  scope: 'company' | 'self';
  /**
   * Permanently reserved for `identity.login` — the one action that must run before any
   * session/tenant exists. No session is required to call it, `roles` must be empty
   * (nothing to check against), and it must be `risk: 'ordinary'` (it cannot use
   * `ctx.audit`/`ctx.db` — there is no tenant-scoped transaction to write into; see
   * `identity.login`'s handler for how it does its own tenant-scoped work once it has
   * resolved which tenant the email belongs to).
   */
  anonymous?: boolean;
  /**
   * Whether Missy's tool bridge (slice 03, `src/mastra/tools/action-tool-bridge.ts`)
   * generates a tool for this action. The bridge builds the toolset at request time from
   * every registered action with `toolExposed: true`, filtered by the caller's roles —
   * so exposing a new capability to Missy is a registry-only change, never chat plumbing.
   * Required (not defaulted) so every action author makes this call explicitly instead of
   * silently inheriting a default.
   */
  toolExposed: boolean;
  /** Shown to the model as the tool description. Falls back to `title` when omitted. */
  toolDescription?: string;
  /**
   * Required when `toolExposed && risk === 'high'` (enforced below): returns a redacted,
   * human-readable summary of `input` for the confirmation card the UI renders before the
   * user approves a high-risk action — never the raw input verbatim, since it may contain
   * salary/bank/PII fields the model itself passed straight through.
   */
  confirmationPreview?: (input: TInput) => Record<string, unknown>;
  handler: (input: TInput, ctx: ActionCtx) => Promise<TOutput>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActionDefinition = DefineActionArgs<any, any>;

// Stashed on `globalThis` (not a plain module-level `const`) so the registry survives
// Next's dev-mode module re-evaluation regardless of exactly which modules get
// invalidated/re-run on a given save — belt-and-braces alongside the dev/production
// split in `defineAction` below, which is the actual fix for the reported symptom (see
// that function's comment).
declare global {
  var __cayamananActionRegistry: Map<string, AnyActionDefinition> | undefined;
}

function getRegistry(): Map<string, AnyActionDefinition> {
  globalThis.__cayamananActionRegistry ??= new Map<string, AnyActionDefinition>();
  return globalThis.__cayamananActionRegistry;
}

const registry = getRegistry();

export function defineAction<TInput, TOutput>(
  def: DefineActionArgs<TInput, TOutput>,
): DefineActionArgs<TInput, TOutput> {
  // Next's dev server hot-reloads individual action modules (e.g. after editing one
  // action file) without necessarily re-evaluating every *other* module that already
  // imported this one — so `registry` above keeps whatever it already held, and the
  // edited module's `defineAction()` call runs again for an id that's already present.
  // Treating that as a hard error (as production must) took down the entire action API
  // until a manual dev-server restart. In anything other than a production boot, the
  // same id being registered again is assumed to be exactly that reload, not a genuine
  // collision, so the new definition simply replaces the old one. A real duplicate id
  // across two different action files is still a defect — `next build`/`next start` run
  // with NODE_ENV=production, where this still throws.
  if (registry.has(def.id) && process.env.NODE_ENV === 'production') {
    throw new Error(`Action already registered: ${def.id}`);
  }
  if (def.anonymous) {
    if (def.roles.length > 0) {
      throw new Error(`Anonymous action "${def.id}" must declare roles: [] — there is no session to check against.`);
    }
    if (def.risk !== 'ordinary') {
      throw new Error(`Anonymous action "${def.id}" must be risk: 'ordinary' — it cannot use ctx.audit().`);
    }
  }
  if (def.toolExposed && def.risk === 'high' && !def.confirmationPreview) {
    throw new Error(
      `Tool-exposed high-risk action "${def.id}" must define confirmationPreview() — the confirmation card ` +
        'has nothing safe to show the user without it.',
    );
  }
  registry.set(def.id, def);
  return def;
}

export function getAction(id: string): AnyActionDefinition | undefined {
  return registry.get(id);
}

/**
 * Every registered action definition — the tool bridge (slice 03,
 * `src/mastra/tools/action-tool-bridge.ts`) is the only intended caller: it filters this
 * down to `toolExposed && roles.some(role in ctx.roles)` at request time to build Missy's
 * toolset, so a new tool is always a registry-only addition, never a change here.
 */
export function listActions(): AnyActionDefinition[] {
  return Array.from(registry.values());
}

export interface ExecuteOptions {
  /**
   * The caller's verified session, or `null`/omitted for an anonymous request. The HTTP
   * route (`src/app/api/actions/[actionId]/route.ts`) is the only place that resolves
   * this from a real cookie; it is never built from anything in the request body. This
   * is the slice-02 replacement for the old `roles`/`userId` parameters, which let any
   * caller assert its own privileges directly.
   */
  session?: VerifiedSession | null;
  /** See `ActionCtx.setSessionCookie` above. */
  onSetCookie?: (token: string | null) => void;
  /** See `ActionCtx.ip`/`ActionCtx.userAgent` above. */
  ip?: string | null;
  userAgent?: string | null;
  /**
   * Attribution for the `audit_logs` row of a `risk: 'high'` action — defaults to
   * `'USER'`. Only `ai.approveAction` (slice 03's confirmation flow,
   * `src/modules/ai/actions/approve-action.ts`) passes `'MISSY'`, and only after
   * independently verifying a single-use, signed confirmation token; this is never
   * accepted from an HTTP request body (the action route never sets it).
   */
  actorKind?: 'USER' | 'MISSY';
  /**
   * Recorded on the `audit_logs` row alongside `actorKind: 'MISSY'` — the confirmation
   * token that authorized this specific execution, for traceability back to the
   * `ai_confirmations` row. Ignored (left `null`) for `actorKind: 'USER'`.
   */
  confirmationToken?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `ctx.db` for the anonymous path — no tenant is known yet, so there is no transaction
 * to hand out. Any access throws immediately and loudly rather than silently returning
 * something unscoped, in case a future anonymous action is added carelessly. */
function poisonedDb(actionId: string): ScopedDb {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(
          `Action "${actionId}" is anonymous and must not use ctx.db (accessed "${String(prop)}") — there is ` +
            "no tenant context yet. Call withTenantContext directly once the tenant is known (see identity.login's handler).",
        );
      },
    },
  ) as ScopedDb;
}

/**
 * Runs a registered action end to end: role check, zod input validation, tenant-scoped
 * transaction, framework audit write for `risk: 'high'`. Never throws — every failure
 * mode returns `{ ok: false, error }`.
 */
export async function executeAction(
  actionId: string,
  rawBody: unknown,
  options: ExecuteOptions = {},
): Promise<ActionResult<unknown>> {
  const requestId = crypto.randomUUID();
  const def = getAction(actionId);
  if (!def) {
    return { ok: false, error: err('NOT_FOUND', `Unknown action: ${actionId}`) };
  }

  const session = options.session ?? null;

  if (!def.anonymous && !session) {
    return { ok: false, error: err('UNAUTHORIZED', 'Authentication is required to perform this action.') };
  }

  const bodyRecord: Record<string, unknown> = isRecord(rawBody) ? rawBody : {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deliberately discarded
  const { tenantId: _ignoredTenantId, companyId: _ignoredCompanyId, ...sanitizedBody } = bodyRecord;
  if ('tenantId' in bodyRecord || 'companyId' in bodyRecord) {
    // Never trust a client-supplied tenant/company id (00-overview.md L1). Log and ignore.
    console.warn('[actions] ignored client-supplied tenant/company scoping', redact({ requestId, actionId }));
  }

  if (!def.anonymous && session && !def.roles.some((role) => session.roles.includes(role))) {
    return { ok: false, error: err('FORBIDDEN', 'You do not have permission to perform this action.') };
  }

  const parsed = def.input.safeParse(sanitizedBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: err('VALIDATION_ERROR', issue?.message ?? 'Invalid input', {
        field: issue?.path.join('.'),
      }),
    };
  }

  try {
    if (def.anonymous) {
      const ctx: ActionCtx = {
        tenantId: '',
        companyId: '',
        userId: null,
        employeeId: null,
        roles: [],
        sessionId: null,
        ip: options.ip ?? null,
        userAgent: options.userAgent ?? null,
        requestId,
        now: new Date(),
        db: poisonedDb(def.id),
        audit() {
          throw new Error(
            `Anonymous action "${def.id}" called ctx.audit() — anonymous actions have no tenant-scoped ` +
              'transaction to write an audit row into.',
          );
        },
        setSessionCookie(token) {
          options.onSetCookie?.(token);
        },
      };
      const data = await def.handler(parsed.data, ctx);
      return { ok: true, data };
    }

    // Non-null by construction: `!def.anonymous && !session` returned UNAUTHORIZED above.
    const verified = session as VerifiedSession;

    const data = await withTenantContext(
      { tenantId: verified.tenantId, companyId: verified.companyId },
      async (db) => {
        let recordedAudit: AuditEntry | null = null;
        const ctx: ActionCtx = {
          tenantId: verified.tenantId,
          companyId: verified.companyId,
          userId: verified.userId,
          // 'self' scope is enforced right here: ctx.employeeId always comes from the
          // verified session, never from the request body/input — a handler has no way
          // to widen it, because nothing else ever sets this field.
          employeeId: verified.employeeId,
          roles: verified.roles,
          sessionId: verified.sessionId,
          ip: options.ip ?? null,
          userAgent: options.userAgent ?? null,
          requestId,
          now: new Date(),
          db,
          audit(entry) {
            if (recordedAudit) {
              // A second call would silently overwrite the first, understating what
              // changed in the authoritative audit table — fail the transaction instead
              // of dropping an entry, same as the "completed without auditing" case below.
              throw new Error(
                `Action "${def.id}" called ctx.audit() more than once; a handler may record only one audit entry per call`,
              );
            }
            recordedAudit = entry;
          },
          setSessionCookie(token) {
            options.onSetCookie?.(token);
          },
        };

        const result = await def.handler(parsed.data, ctx);

        if (def.risk === 'high' && !recordedAudit) {
          // A high-risk handler that completes without auditing is a defect, not a
          // client error — fail the transaction so nothing high-risk ships unaudited.
          throw new Error(`High-risk action "${def.id}" completed without recording an audit entry`);
        }

        // Persist whenever a handler recorded an entry, whatever its risk level. Gating
        // the write on `risk === 'high'` meant an ordinary action could call ctx.audit()
        // and have it silently discarded — which is how `employee.updateGovernmentIds`
        // (tax identifiers, updated in place with no history) ended up unauditable.
        // High risk still *requires* an entry; ordinary actions may opt in.
        if (recordedAudit) {
          const entry: AuditEntry = recordedAudit;
          await db.insert(auditLogs).values({
            tenantId: verified.tenantId,
            companyId: verified.companyId,
            actorUserId: verified.userId,
            actorKind: options.actorKind ?? 'USER',
            actionId: def.id,
            entityType: entry.entityType,
            entityId: entry.entityId,
            before: entry.before,
            after: entry.after,
            requestId,
            confirmationToken: options.actorKind === 'MISSY' ? (options.confirmationToken ?? null) : null,
          });
        }

        return result;
      },
    );
    return { ok: true, data };
  } catch (error) {
    console.error(
      '[actions] handler failed',
      redact({
        requestId,
        actionId,
        message: error instanceof Error ? error.message : 'unknown error',
      }),
    );
    if (error instanceof ActionError) {
      return { ok: false, error: err(error.code, error.message, { field: error.field, details: error.details }) };
    }
    return { ok: false, error: err('INTERNAL', 'Something went wrong. Please try again.') };
  }
}

export type { AppError, ActionResult };
