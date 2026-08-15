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
  handler: (input: TInput, ctx: ActionCtx) => Promise<TOutput>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActionDefinition = DefineActionArgs<any, any>;

const registry = new Map<string, AnyActionDefinition>();

export function defineAction<TInput, TOutput>(
  def: DefineActionArgs<TInput, TOutput>,
): DefineActionArgs<TInput, TOutput> {
  if (registry.has(def.id)) {
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
  registry.set(def.id, def);
  return def;
}

export function getAction(id: string): AnyActionDefinition | undefined {
  return registry.get(id);
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

        if (def.risk === 'high') {
          if (!recordedAudit) {
            // A high-risk handler that completes without auditing is a defect, not a
            // client error — fail the transaction so nothing high-risk ships unaudited.
            throw new Error(`High-risk action "${def.id}" completed without recording an audit entry`);
          }
          const entry: AuditEntry = recordedAudit;
          await db.insert(auditLogs).values({
            tenantId: verified.tenantId,
            companyId: verified.companyId,
            actorUserId: verified.userId,
            actorKind: 'USER',
            actionId: def.id,
            entityType: entry.entityType,
            entityId: entry.entityId,
            before: entry.before,
            after: entry.after,
            requestId,
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
      return { ok: false, error: err(error.code, error.message) };
    }
    return { ok: false, error: err('INTERNAL', 'Something went wrong. Please try again.') };
  }
}

export type { AppError, ActionResult };
