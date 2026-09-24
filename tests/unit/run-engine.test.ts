import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAdapter } from "@/server/adapters/fake";
import type { AppAdapter, ExecuteResult } from "@/server/adapters/types";
import { createRunEngine } from "@/server/runs/orchestrator";
import { createMemoryRunStore, type MemoryRunStore } from "@/server/runs/memory-store";
import type { ActionConfig } from "@/lib/schemas/workflow-config";

const STALE = 90_000;
const TIMEOUT = 10_000;
const USER = "user-1";
const goodTrigger = {
  title: "Demo",
  start: "2026-03-15T10:00:00Z",
  end: "2026-03-15T11:00:00Z",
  email: "a@example.com",
};
const goodConfig: ActionConfig = {
  title: { kind: "mapped", source: "title" },
  start: { kind: "mapped", source: "start" },
  end: { kind: "mapped", source: "end" },
  attendee_email: { kind: "mapped", source: "email" },
};

let now = new Date("2026-09-24T12:00:00Z");
let store: MemoryRunStore;
let token = "good-token";
let rateLimited = false;

function engine(adapter: AppAdapter = fakeAdapter) {
  return createRunEngine({
    store,
    getAdapter: () => adapter,
    getAccessToken: async () => token,
    checkRateLimit: async () => {
      if (rateLimited) throw Object.assign(new Error("rate"), { code: "rate_limited" });
    },
    now: () => now,
    appCallTimeoutMs: TIMEOUT,
    staleRunningMs: STALE,
  });
}

beforeEach(() => {
  now = new Date("2026-09-24T12:00:00Z");
  token = "good-token";
  rateLimited = false;
  store = createMemoryRunStore();
  store.seedWorkflow({
    id: "wf-1",
    userId: USER,
    actionKey: "create_event",
    config: goodConfig,
    triggerFields: ["title", "start", "end", "email"],
    connectionStatus: "active",
  });
});

describe("startRun", () => {
  it("runs the action, records a succeeded attempt with the config actually used", async () => {
    const run = await engine().startRun("wf-1", USER, goodTrigger);
    expect(run.status).toBe("succeeded");
    const [a] = store.attempts(run.id);
    expect(a).toMatchObject({ attemptNo: 1, status: "succeeded", idempotencyKey: `${run.id}:action:1` });
    expect(a?.externalRef).toBe(`fake-${run.id}:action:1`);
    expect(a?.configSnapshot).toEqual(goodConfig);
  });

  it("rejects trigger data that does not match the trigger schema", async () => {
    await expect(engine().startRun("wf-1", USER, { title: "x" })).rejects.toMatchObject({ code: "validation_failed" });
    expect(store.runCount()).toBe(0);
  });

  it("requires an active connection", async () => {
    store.setConnectionStatus("wf-1", "needs_reconnect");
    await expect(engine().startRun("wf-1", USER, goodTrigger)).rejects.toMatchObject({ code: "no_active_connection" });
    expect(store.runCount()).toBe(0);
  });

  it("does not run a workflow owned by someone else", async () => {
    await expect(engine().startRun("wf-1", "user-2", goodTrigger)).rejects.toMatchObject({ code: "not_found" });
  });

  it("checks the rate limit before creating anything", async () => {
    rateLimited = true;
    await expect(engine().startRun("wf-1", USER, goodTrigger)).rejects.toThrow();
    expect(store.runCount()).toBe(0);
  });

  it("stores a sanitized standard error and marks the run failed", async () => {
    const run = await engine().startRun("wf-1", USER, { ...goodTrigger, email: "" });
    expect(run.status).toBe("failed");
    const [a] = store.attempts(run.id);
    expect(a?.status).toBe("failed");
    expect(a?.errorStd).toMatchObject({ category_hint: "missing_field", field: "attendee_email" });
  });

  it("writes the running row BEFORE the real call", async () => {
    let seenDuringCall: string | undefined;
    const spy: AppAdapter = {
      ...fakeAdapter,
      execute: async (k, v, c) => {
        seenDuringCall = store.allAttempts()[0]?.status;
        return fakeAdapter.execute(k, v, c);
      },
    };
    await engine(spy).startRun("wf-1", USER, goodTrigger);
    expect(seenDuringCall).toBe("running");
  });

  it("passes the access token and timeout to the adapter, and never stores the token", async () => {
    token = "secret-token-value";
    const execute = vi.fn(fakeAdapter.execute.bind(fakeAdapter));
    const run = await engine({ ...fakeAdapter, execute }).startRun("wf-1", USER, goodTrigger);
    expect(execute.mock.calls[0]?.[2]).toMatchObject({ accessToken: "secret-token-value", timeoutMs: TIMEOUT });
    expect(JSON.stringify(store.attempts(run.id))).not.toContain("secret-token-value");
    expect(JSON.stringify(store.getRunSync(run.id))).not.toContain("secret-token-value");
  });

  it("leaves the attempt running (not failed) if the process is interrupted mid-call", async () => {
    const hang: AppAdapter = { ...fakeAdapter, execute: () => new Promise<ExecuteResult>(() => {}) };
    const p = engine(hang).startRun("wf-1", USER, goodTrigger);
    p.catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(store.allAttempts()[0]?.status).toBe("running");
  });
});

describe("reconcile on read (safety test 11 support)", () => {
  it("reports a stale running attempt as uncertain and persists it", async () => {
    const hang: AppAdapter = { ...fakeAdapter, execute: () => new Promise<ExecuteResult>(() => {}) };
    engine(hang).startRun("wf-1", USER, goodTrigger).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    const runId = store.allAttempts()[0]!.runId;

    now = new Date(now.getTime() + 10_000);
    expect((await engine().getRun(runId, USER)).attempts[0]?.status).toBe("running");

    now = new Date(now.getTime() + STALE);
    const view = await engine().getRun(runId, USER);
    expect(view.attempts[0]?.status).toBe("uncertain");
    expect(view.run.status).toBe("uncertain");
    expect(store.attempts(runId)[0]?.status).toBe("uncertain");
  });

  it("hides another user's run", async () => {
    const run = await engine().startRun("wf-1", USER, goodTrigger);
    await expect(engine().getRun(run.id, "user-2")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("retryFailedStep (safety tests 4 and 11)", () => {
  async function failedRun() {
    return engine().startRun("wf-1", USER, { ...goodTrigger, email: "" });
  }

  it("retries with the CURRENT config and the SAME saved trigger data", async () => {
    const run = await failedRun();
    store.updateWorkflowConfig("wf-1", { ...goodConfig, attendee_email: { kind: "static", value: "fixed@example.com" } });
    const retried = await engine().retryFailedStep(run.id, USER, { idempotencyKey: "k1" });
    expect(retried.status).toBe("succeeded");
    const attempts = store.attempts(run.id);
    expect(attempts.map((a) => a.attemptNo)).toEqual([1, 2]);
    expect(attempts[1]?.configSnapshot).toMatchObject({ attendee_email: { kind: "static" } });
    expect(store.getRunSync(run.id)?.triggerData).toEqual({ ...goodTrigger, email: "" });
  });

  it("a repeated Idempotency-Key returns the original attempt and creates no new one", async () => {
    const run = await failedRun();
    await engine().retryFailedStep(run.id, USER, { idempotencyKey: "k1" });
    await engine().retryFailedStep(run.id, USER, { idempotencyKey: "k1" });
    expect(store.attempts(run.id)).toHaveLength(2);
  });

  it("a double click creates exactly one attempt", async () => {
    const run = await failedRun();
    const results = await Promise.allSettled([
      engine().retryFailedStep(run.id, USER, { idempotencyKey: "a" }),
      engine().retryFailedStep(run.id, USER, { idempotencyKey: "b" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(store.attempts(run.id)).toHaveLength(2);
  });

  it("never runs against a succeeded step", async () => {
    const run = await engine().startRun("wf-1", USER, goodTrigger);
    await expect(engine().retryFailedStep(run.id, USER, { idempotencyKey: "k" })).rejects.toMatchObject({
      code: "already_succeeded",
    });
    expect(store.attempts(run.id).filter((a) => a.status === "succeeded")).toHaveLength(1);
    expect(store.attempts(run.id)).toHaveLength(1);
  });

  it("refuses an uncertain attempt unless confirmed", async () => {
    const timeout: AppAdapter = {
      ...fakeAdapter,
      execute: async () => ({
        ok: false,
        requestSummary: {},
        error: { category_hint: "unavailable", code: "timeout", message: "timed out", retryable: true, outcome: "uncertain" },
      }),
    };
    const run = await engine(timeout).startRun("wf-1", USER, goodTrigger);
    expect(store.attempts(run.id)[0]?.status).toBe("uncertain");
    await expect(engine().retryFailedStep(run.id, USER, { idempotencyKey: "k" })).rejects.toMatchObject({
      code: "uncertain_needs_confirmation",
    });
    const ok = await engine().retryFailedStep(run.id, USER, { idempotencyKey: "k2", confirmUncertain: true });
    expect(ok.status).toBe("succeeded");
  });

  it("checks the rate limit before a retry", async () => {
    const run = await failedRun();
    rateLimited = true;
    await expect(engine().retryFailedStep(run.id, USER, { idempotencyKey: "k" })).rejects.toThrow();
    expect(store.attempts(run.id)).toHaveLength(1);
  });

  it("increments repair_count only when a change was applied since the last attempt AND the retry fails", async () => {
    const run = await failedRun();

    // retry with NO applied change that fails again: no increment
    await engine().retryFailedStep(run.id, USER, { idempotencyKey: "r1" });
    expect(store.getRunSync(run.id)?.repairCount).toBe(0);

    // applied change, retry still fails: increment
    store.markChangeApplied(run.id, new Date(now.getTime() + 1));
    now = new Date(now.getTime() + 1000);
    await engine().retryFailedStep(run.id, USER, { idempotencyKey: "r2" });
    expect(store.getRunSync(run.id)?.repairCount).toBe(1);
  });

  it("does not increment repair_count when the retry after an applied change succeeds", async () => {
    const run = await failedRun();
    store.updateWorkflowConfig("wf-1", { ...goodConfig, attendee_email: { kind: "static", value: "x@example.com" } });
    now = new Date(now.getTime() + 1000);
    store.markChangeApplied(run.id, now);
    now = new Date(now.getTime() + 1000);
    await engine().retryFailedStep(run.id, USER, { idempotencyKey: "r1" });
    expect(store.getRunSync(run.id)?.repairCount).toBe(0);
    expect(store.getRunSync(run.id)?.status).toBe("succeeded");
  });

  it("never retries automatically", async () => {
    const execute = vi.fn(fakeAdapter.execute.bind(fakeAdapter));
    await engine({ ...fakeAdapter, execute }).startRun("wf-1", USER, { ...goodTrigger, email: "" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
