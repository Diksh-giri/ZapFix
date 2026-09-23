import { z } from "zod";

/**
 * What every adapter returns when a real app call goes wrong (TDD section 10).
 * Rules read ONLY this shape, never raw app responses.
 *
 * `outcome`:
 *   not_executed  the app rejected the request before doing anything
 *   failed        the app tried and failed; nothing was created
 *   uncertain     we do not know whether the action happened (timeout, dropped connection)
 */
export const StandardErrorSchema = z.object({
  category_hint: z.enum([
    "missing_field",
    "invalid_value",
    "auth",
    "rate_limit",
    "not_found",
    "unavailable",
    "unknown",
  ]),
  code: z.string().min(1).max(120),
  /** Sanitized: quoted user values must be masked before this is stored (TDD section 28 item 6). */
  message: z.string().max(500),
  /** The action field the error points at, when the app says so. */
  field: z.string().optional(),
  retryable: z.boolean(),
  outcome: z.enum(["not_executed", "failed", "uncertain"]),
});
export type StandardError = z.infer<typeof StandardErrorSchema>;
