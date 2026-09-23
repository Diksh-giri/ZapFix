/** Event types recorded for the PRD success metrics (TDD section 23). */
export const EVENT_TYPES = [
  "failure_opened",
  "diagnosis_requested",
  "diagnosis_ready",
  "summary_viewed",
  "proposal_decided",
  "change_applied",
  "retry_started",
  "retry_finished",
  "restore_started",
  "restore_finished",
  "connection_expired",
  "rate_limited",
  "repair_limit_reached",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Proposed per-user limits per hour. Confirm at T15 (TDD section 28 item 7). */
export const RATE_LIMITS = { runs: 30, retries: 30, diagnoses: 30 } as const;

// TODO(T15): recordEvent(db, {userId, runId?, type, payload}); checkRateLimit(db, userId, bucket).
