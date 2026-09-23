import type { AttemptStatus } from "@/lib/types";
import { AppError } from "@/lib/errors";

/**
 * Run Engine (module 5, tasks T12).
 * The pure guards below are DONE and tested. The database-touching orchestration is TODO.
 *
 * Sequence for one attempt (TDD section 12):
 *  1. INSERT step_attempts (status "running")  <- rejected by the DB if one is running or a success exists
 *  2. Decrypt token server-side, call adapter.execute with a timeout
 *  3. success -> "succeeded" + external_ref; failure -> "failed" + sanitized error;
 *     interrupted -> stays "running"; the next read after STALE_RUNNING_MS marks it "uncertain"
 */

export interface AttemptLite {
  status: AttemptStatus;
  startedAt: Date;
}

export function idempotencyKey(runId: string, stepKey: string, attemptNo: number): string {
  return `${runId}:${stepKey}:${attemptNo}`;
}

/** A "running" attempt older than the stale window is treated as "uncertain" (no cron needed). */
export function effectiveStatus(attempt: AttemptLite, now: Date, staleMs: number): AttemptStatus {
  if (attempt.status === "running" && now.getTime() - attempt.startedAt.getTime() > staleMs) {
    return "uncertain";
  }
  return attempt.status;
}

/**
 * Decision #010: retry only the failed step; never re-run a success; never retry an
 * uncertain outcome without an explicit confirmation.
 */
export function assertRetryAllowed(
  latest: AttemptLite | undefined,
  now: Date,
  staleMs: number,
  opts: { confirmUncertain?: boolean } = {},
): void {
  if (!latest) throw new AppError("conflict", "This run has no attempt to retry.");
  switch (effectiveStatus(latest, now, staleMs)) {
    case "failed":
      return;
    case "running":
      throw new AppError("attempt_running", "An attempt is already running. Wait for it to finish.");
    case "succeeded":
      throw new AppError("already_succeeded", "This step already succeeded, so it cannot be retried.");
    case "uncertain":
      if (opts.confirmUncertain) return;
      throw new AppError(
        "uncertain_needs_confirmation",
        "We are not sure whether this step already happened. Check the app first, then confirm to retry.",
      );
  }
}

// TODO(T12): startRun(), executeAttempt(), retryFailedStep() using db + adapters + these guards.
