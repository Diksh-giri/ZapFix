import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, recordEvent, RATE_LIMITS } from "@/server/audit/events";
import type { AuditStore, StoredEvent } from "@/server/audit/store";

let events: StoredEvent[];
let counters: Map<string, number>;
let failEventInsert = false;

const store: AuditStore = {
  async insertEvent(e) {
    if (failEventInsert) throw new Error("db down");
    events.push(e);
  },
  async hasEvent(userId, runId, type) {
    return events.some((e) => e.userId === userId && e.runId === runId && e.type === type);
  },
  async incrementRateLimit(userId, bucket, windowStart) {
    const k = `${userId}|${bucket}|${windowStart.toISOString()}`;
    const n = (counters.get(k) ?? 0) + 1;
    counters.set(k, n);
    return n;
  },
  async runOwnedBy(runId, userId) {
    return runId === "run-1" && userId === "user-1";
  },
};

let now = new Date("2026-09-24T12:34:56Z");
const deps = () => ({ store, now: () => now });

beforeEach(() => {
  events = [];
  counters = new Map();
  failEventInsert = false;
  now = new Date("2026-09-24T12:34:56Z");
});

describe("recordEvent", () => {
  it("stores the user, run, type and an ids-and-enums payload", async () => {
    await recordEvent(store, {
      userId: "user-1",
      runId: "run-1",
      type: "retry_started",
      payload: { attempt_no: 2, category: "missing_required_field", confirmed: true, note: null },
    });
    expect(events).toEqual([
      {
        userId: "user-1",
        runId: "run-1",
        type: "retry_started",
        payload: { attempt_no: 2, category: "missing_required_field", confirmed: true, note: null },
      },
    ]);
  });

  it("accepts a missing payload and a missing run", async () => {
    await recordEvent(store, { userId: "user-1", type: "connection_expired" });
    expect(events[0]).toMatchObject({ runId: null, payload: null });
  });

  it("refuses an unknown event type", async () => {
    await expect(recordEvent(store, { userId: "user-1", type: "made_up" as never })).rejects.toThrow(/event type/i);
    expect(events).toHaveLength(0);
  });

  it("refuses payloads that could carry personal content or secrets", async () => {
    const bad: Array<Record<string, unknown>> = [
      { who: "tester@example.com" },
      { message: "Meeting with the client about pricing" },
      { long: "x".repeat(200) },
      { nested: { a: 1 } },
      { list: ["a", "b"] },
      { access_token: "abc" },
      { client_secret: "abc" },
      { email: "abc" },
      { authorization: "abc" },
    ];
    for (const payload of bad) {
      await expect(recordEvent(store, { userId: "user-1", type: "retry_started", payload: payload as never })).rejects.toThrow();
    }
    expect(events).toHaveLength(0);
  });

  it("accepts ids: uuids, run:step:n keys and plain enums", async () => {
    await recordEvent(store, {
      userId: "user-1",
      type: "change_applied",
      payload: { proposal_id: "0b8e9f3a-0c1a-4d0e-8a86-0d3a5f0f7c11", key: "run-1:action:2", outcome: "succeeded" },
    });
    expect(events).toHaveLength(1);
  });

  it("with once, records a run's event a single time", async () => {
    for (let i = 0; i < 3; i++) await recordEvent(store, { userId: "user-1", runId: "run-1", type: "failure_opened", once: true });
    expect(events).toHaveLength(1);
    await recordEvent(store, { userId: "user-1", runId: "run-1", type: "summary_viewed", once: true });
    expect(events).toHaveLength(2);
  });
});

describe("checkRateLimit", () => {
  it("allows up to the limit and refuses the next call with a plain 429 error", async () => {
    for (let i = 0; i < RATE_LIMITS.retries; i++) await checkRateLimit(deps(), "user-1", "retries");
    const err = await checkRateLimit(deps(), "user-1", "retries").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "rate_limited", status: 429 });
    expect((err as { message: string }).message).toMatch(/too many|try again/i);
  });

  it("tells the tester when to come back", async () => {
    for (let i = 0; i < RATE_LIMITS.runs; i++) await checkRateLimit(deps(), "user-1", "runs");
    const err = (await checkRateLimit(deps(), "user-1", "runs").catch((e: unknown) => e)) as { details?: { retryAfterSeconds?: number } };
    // 12:34:56 -> next hour starts 13:00:00
    expect(err.details?.retryAfterSeconds).toBe(25 * 60 + 4);
  });

  it("keeps buckets and users separate", async () => {
    for (let i = 0; i < RATE_LIMITS.runs; i++) await checkRateLimit(deps(), "user-1", "runs");
    await expect(checkRateLimit(deps(), "user-1", "retries")).resolves.toBeUndefined();
    await expect(checkRateLimit(deps(), "user-2", "runs")).resolves.toBeUndefined();
  });

  it("starts a fresh window each hour", async () => {
    for (let i = 0; i < RATE_LIMITS.runs; i++) await checkRateLimit(deps(), "user-1", "runs");
    now = new Date("2026-09-24T13:00:00Z");
    await expect(checkRateLimit(deps(), "user-1", "runs")).resolves.toBeUndefined();
  });

  it("counts inside one UTC hour window", async () => {
    await checkRateLimit(deps(), "user-1", "runs");
    now = new Date("2026-09-24T12:59:59Z");
    await checkRateLimit(deps(), "user-1", "runs");
    expect([...counters.keys()]).toEqual(["user-1|runs|2026-09-24T12:00:00.000Z"]);
    expect([...counters.values()]).toEqual([2]);
  });

  it("records a rate_limited event, and still refuses if that write fails", async () => {
    for (let i = 0; i < RATE_LIMITS.diagnoses; i++) await checkRateLimit(deps(), "user-1", "diagnoses");
    await checkRateLimit(deps(), "user-1", "diagnoses").catch(() => {});
    expect(events.at(-1)).toMatchObject({ type: "rate_limited", payload: { bucket: "diagnoses" } });

    failEventInsert = true;
    await expect(checkRateLimit(deps(), "user-1", "diagnoses")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("uses the proposed limits of 30 per hour", () => {
    expect(RATE_LIMITS).toEqual({ runs: 30, retries: 30, diagnoses: 30 });
  });
});
