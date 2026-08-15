// §4.5 — actions return `{ ok: true, data } | { ok: false, error }`, never throw across
// the action boundary. Error codes are stable SCREAMING_SNAKE strings. Messages must be
// safe to show and safe to log: never put salary, bank, tax id, or PII in `message`.
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

export interface AppError {
  code: ErrorCode;
  message: string;
  field?: string;
  details?: unknown;
}

export function err(code: ErrorCode, message: string, options?: { field?: string; details?: unknown }): AppError {
  return { code, message, field: options?.field, details: options?.details };
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

/**
 * Thrown by a handler that wants to surface a specific, known-safe `AppError` (code +
 * message) instead of the generic `INTERNAL` catch-all `executeAction()` uses for
 * anything else thrown. Message must follow the same "safe to show, safe to log" rule
 * as `err()` above. Anything not thrown as `ActionError` is treated as an unexpected
 * defect and mapped to `INTERNAL`.
 */
export class ActionError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
  }
}
