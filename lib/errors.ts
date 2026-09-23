/**
 * Standard API error body (TDD section 20):
 *   { "error": { "code": "snake_case", "message": "plain sentence", "details"?: {...} } }
 * Every route handler returns errors in this shape, via AppError.
 */
export const ERROR_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  not_implemented: 501,
  // Specific 409 codes the screens rely on (TDD section 20)
  repair_limit_reached: 409,
  manual_edit_conflict: 409,
  proposal_outdated: 409,
  attempt_running: 409,
  already_succeeded: 409,
  uncertain_needs_confirmation: 409,
  version_conflict: 409,
  no_active_connection: 409,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export type ErrorBody = {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
};

export function toErrorBody(err: AppError): ErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  };
}
