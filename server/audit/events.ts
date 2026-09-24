import { AppError } from "@/lib/errors";
import type { AuditStore } from "./store";

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

/** Proposed per-user limits per hour (TDD Appendix F). Confirm with the human. */
export const RATE_LIMITS = { runs: 30, retries: 30, diagnoses: 30 } as const;
export type RateBucket = keyof typeof RATE_LIMITS;

type Payload = Record<string, string | number | boolean | null>;

// Ids and enums only: no spaces, no "@", short. Keys that sound like secrets are refused outright.
const SAFE_STRING = /^[A-Za-z0-9_.:-]{1,64}$/;
const SAFE_KEY = /^[A-Za-z0-9_]{1,40}$/;
const SECRET_KEY = /token|secret|password|authorization|cookie|credential|api_?key|verifier|email/i;

function assertSafePayload(payload: Record<string, unknown>): asserts payload is Payload {
  for (const [key, value] of Object.entries(payload)) {
    if (!SAFE_KEY.test(key) || SECRET_KEY.test(key)) throw new Error(`Event payload key "${key}" is not allowed.`);
    const ok =
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && SAFE_STRING.test(value));
    if (!ok) throw new Error(`Event payload value for "${key}" must be an id, an enum, a number or a boolean.`);
  }
}

export async function recordEvent(
  store: AuditStore,
  input: { userId: string; runId?: string; type: EventType; payload?: Payload; once?: boolean },
): Promise<void> {
  if (!EVENT_TYPES.includes(input.type)) throw new Error(`Unknown event type "${String(input.type)}".`);
  if (input.payload) assertSafePayload(input.payload);
  if (input.once && input.runId && (await store.hasEvent(input.userId, input.runId, input.type))) return;
  await store.insertEvent({
    userId: input.userId,
    runId: input.runId ?? null,
    type: input.type,
    payload: input.payload ?? null,
  });
}

/** Counts this call in the user's hourly window for the bucket; throws a 429-style error over the limit. */
export async function checkRateLimit(
  deps: { store: AuditStore; now: () => Date; limits?: Record<RateBucket, number> },
  userId: string,
  bucket: RateBucket,
): Promise<void> {
  const now = deps.now();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const count = await deps.store.incrementRateLimit(userId, bucket, windowStart);
  if ((deps.limits ?? RATE_LIMITS)[bucket] >= count) return;

  await recordEvent(deps.store, { userId, type: "rate_limited", payload: { bucket } }).catch(() => {});
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + 3_600_000 - now.getTime()) / 1000);
  throw new AppError("rate_limited", "You have done that too many times this hour. Please try again later.", {
    retryAfterSeconds,
  });
}
