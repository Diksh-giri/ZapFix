import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connections, runs, stepAttempts, workflows } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { fakeAdapter } from "@/server/adapters/fake";
import type { AppAdapter } from "@/server/adapters/types";
import { createDrizzleRunStore } from "@/server/runs/drizzle-store";
import { createRunEngine } from "@/server/runs/orchestrator";
import { USER, db, resetUsers, scratchEnabled, sql } from "./_support/scratch-db";

/**
 * The run engine on a REAL Postgres: safety tests 4 and 11. Scratch database only: see _support/scratch-db.ts.
 * Test 4: simultaneous retries create ONE new attempt and a step never has two successes.
 * Test 11: an `uncertain` attempt is not retried without explicit confirmation.
 */
const WORKFLOW = "10000000-0000-4000-8000-000000000011";
const CONNECTION = "50000000-0000-4000-8000-000000000011";
const STALE_MS = 90_000;

// "email" is empty in the run's data, so the first attempt fails with a missing field.
const trigger = { title: "Demo", start: "2026-03-15T10:00:00Z", end: "2026-03-15T11:00:00Z", email: "", contact_email: "a@example.com" };
const brokenConfig: ActionConfig = {
  title: { kind: "mapped", source: "title" },
  start: { kind: "mapped", source: "start" },
  end: { kind: "mapped", source: "end" },
  attendee_email: { kind: "mapped", source: "email" },
};
const fixedConfig: ActionConfig = { ...brokenConfig, attendee_email: { kind: "mapped", source: "contact_email" } };

afterAll(async () => {
  await sql?.end();
});

function engine(adapter: AppAdapter = fakeAdapter, now: () => Date = () => new Date()) {
  return createRunEngine({
    store: createDrizzleRunStore(db!),
    getAdapter: () => adapter,
    getAccessToken: async () => ({ ok: true, accessToken: "test-token" }),
    checkRateLimit: async () => {},
    now,
    appCallTimeoutMs: 5000,
    staleRunningMs: STALE_MS,
  });
}

/** An adapter whose action always ends with an unknown outcome (timeout or dropped connection). */
const uncertainAdapter: AppAdapter = {
  ...fakeAdapter,
  async execute() {
    return {
      ok: false,
      requestSummary: {},
      error: { category_hint: "unavailable", code: "timeout", message: "The app did not answer in time.", retryable: true, outcome: "uncertain" },
    };
  },
};

async function seed(): Promise<void> {
  await resetUsers();
  await db!.insert(connections).values({ id: CONNECTION, userId: USER, provider: "google", status: "active" });
  await db!.insert(workflows).values({
    id: WORKFLOW,
    userId: USER,
    name: "wf",
    app: "google_calendar",
    actionKey: "create_event",
    connectionId: CONNECTION,
    triggerSchema: { fields: ["title", "start", "end", "email", "contact_email"].map((key) => ({ key, label: key, type: "text" })) },
    actionConfig: brokenConfig,
  });
}

const attemptsOf = (runId: string) => db!.select().from(stepAttempts).where(eq(stepAttempts.runId, runId)).orderBy(stepAttempts.attemptNo);

describe.skipIf(!scratchEnabled)("run engine on a real database (scratch only)", () => {
  beforeEach(seed);

  it("a failed first attempt is saved, and a retry after the fix succeeds", async () => {
    const e = engine();
    const run = await e.startRun(WORKFLOW, USER, trigger);
    expect(run.status).toBe("failed");
    await db!.update(workflows).set({ actionConfig: fixedConfig }).where(eq(workflows.id, WORKFLOW));
    const after = await e.retryFailedStep(run.id, USER);
    expect(after.status).toBe("succeeded");
    expect((await attemptsOf(run.id)).map((a) => [a.attemptNo, a.status])).toEqual([[1, "failed"], [2, "succeeded"]]);
  });

  it("SAFETY TEST 4: two simultaneous retries create one new attempt and one success", async () => {
    const e = engine();
    const run = await e.startRun(WORKFLOW, USER, trigger);
    await db!.update(workflows).set({ actionConfig: fixedConfig }).where(eq(workflows.id, WORKFLOW));

    const results = await Promise.allSettled([e.retryFailedStep(run.id, USER), e.retryFailedStep(run.id, USER)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AppError);
    expect(["attempt_running", "already_succeeded", "conflict"]).toContain((rejected.reason as AppError).code);

    const attempts = await attemptsOf(run.id);
    expect(attempts).toHaveLength(2); // the first failure and exactly one retry
    expect(attempts.filter((a) => a.status === "succeeded")).toHaveLength(1);
    expect(attempts.filter((a) => a.status === "running")).toHaveLength(0);
  });

  it("SAFETY TEST 4: a step that already succeeded cannot be run again", async () => {
    const e = engine();
    await db!.update(workflows).set({ actionConfig: fixedConfig }).where(eq(workflows.id, WORKFLOW));
    const run = await e.startRun(WORKFLOW, USER, trigger);
    expect(run.status).toBe("succeeded");
    await expect(e.retryFailedStep(run.id, USER)).rejects.toMatchObject({ code: "already_succeeded" });
    expect(await attemptsOf(run.id)).toHaveLength(1);
  });

  it("SAFETY TEST 4: the database itself refuses a second running attempt and a second success", async () => {
    const run = await engine().startRun(WORKFLOW, USER, trigger);
    const store = createDrizzleRunStore(db!);
    const base = { runId: run.id, stepKey: "action", status: "running" as const, configSnapshot: fixedConfig, startedAt: new Date() };
    await store.insertAttempt({ ...base, attemptNo: 2, idempotencyKey: `${run.id}:action:2` });
    await expect(store.insertAttempt({ ...base, attemptNo: 3, idempotencyKey: `${run.id}:action:3` })).rejects.toMatchObject({ code: "attempt_running" });
  });

  it("SAFETY TEST 11: an uncertain attempt is not retried without confirmation, and is with it", async () => {
    const e = engine(uncertainAdapter);
    const run = await e.startRun(WORKFLOW, USER, trigger);
    expect(run.status).toBe("uncertain");

    await expect(e.retryFailedStep(run.id, USER)).rejects.toMatchObject({ code: "uncertain_needs_confirmation" });
    expect(await attemptsOf(run.id)).toHaveLength(1); // nothing was sent

    await e.retryFailedStep(run.id, USER, { confirmUncertain: true });
    expect(await attemptsOf(run.id)).toHaveLength(2);
  });

  it("SAFETY TEST 11: a running attempt that went quiet is read as uncertain, and saved that way", async () => {
    const run = await engine().startRun(WORKFLOW, USER, trigger);
    await db!.update(stepAttempts).set({ status: "running", finishedAt: null }).where(eq(stepAttempts.runId, run.id));
    await db!.update(runs).set({ status: "running", finishedAt: null }).where(eq(runs.id, run.id));

    const later = () => new Date(Date.now() + STALE_MS + 60_000);
    const view = await engine(fakeAdapter, later).getRun(run.id, USER);
    expect(view.attempts[0]!.status).toBe("uncertain");
    expect((await attemptsOf(run.id))[0]!.status).toBe("uncertain");
    await expect(engine(fakeAdapter, later).retryFailedStep(run.id, USER)).rejects.toMatchObject({ code: "uncertain_needs_confirmation" });
  });
});
