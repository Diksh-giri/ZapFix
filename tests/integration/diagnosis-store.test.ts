import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runs, stepAttempts, workflows } from "@/db/schema";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { createDrizzleDiagnosisStore } from "@/server/diagnosis/drizzle-store";
import { OTHER_USER, USER, db, resetUsers, scratchEnabled, sql } from "./_support/scratch-db";

const WORKFLOW = "10000000-0000-4000-8000-000000000031";
const RUN = "20000000-0000-4000-8000-000000000031";
const FIRST_ATTEMPT = "30000000-0000-4000-8000-000000000031";
const LATEST_ATTEMPT = "30000000-0000-4000-8000-000000000032";
const OTHER_WORKFLOW = "10000000-0000-4000-8000-000000000032";
const MISMATCHED_RUN = "20000000-0000-4000-8000-000000000032";
const MISMATCHED_ATTEMPT = "30000000-0000-4000-8000-000000000033";

const failedConfig: ActionConfig = {
  start: { kind: "mapped", source: "date" },
};
const currentConfig: ActionConfig = {
  start: {
    kind: "mapped",
    source: "date",
    transform: { kind: "date_to_rfc3339", fromFormat: "MM/DD/YYYY", timeZone: "UTC" },
  },
};

afterAll(async () => {
  await sql?.end();
});

async function seed() {
  await resetUsers();
  await db!.insert(workflows).values({
    id: WORKFLOW,
    userId: USER,
    name: "Diagnosis persistence",
    app: "google_calendar",
    actionKey: "create_event",
    triggerSchema: { fields: [{ key: "date", label: "Date", type: "date" }] },
    actionConfig: currentConfig,
    configVersion: 2,
  });
  await db!.insert(workflows).values({
    id: OTHER_WORKFLOW,
    userId: OTHER_USER,
    name: "Other user's workflow",
    app: "google_calendar",
    actionKey: "create_event",
    triggerSchema: { fields: [{ key: "date", label: "Date", type: "date" }] },
    actionConfig: currentConfig,
    configVersion: 1,
  });
  await db!.insert(runs).values({
    id: RUN,
    workflowId: WORKFLOW,
    userId: USER,
    triggerData: { date: "03/15/2026" },
    status: "failed",
  });
  await db!.insert(stepAttempts).values([
    {
      id: FIRST_ATTEMPT,
      runId: RUN,
      attemptNo: 1,
      status: "failed",
      configSnapshot: failedConfig,
      idempotencyKey: `${RUN}:action:1`,
      errorStd: {
        category_hint: "unavailable",
        code: "temporary",
        message: "The app was temporarily unavailable.",
        retryable: true,
        outcome: "failed",
      },
    },
    {
      id: LATEST_ATTEMPT,
      runId: RUN,
      attemptNo: 2,
      status: "failed",
      configSnapshot: failedConfig,
      idempotencyKey: `${RUN}:action:2`,
      errorStd: {
        category_hint: "invalid_value",
        code: "badRequest",
        message: "Bad Request",
        field: "start",
        retryable: false,
        outcome: "not_executed",
      },
    },
  ]);
  await db!.insert(runs).values({
    id: MISMATCHED_RUN,
    workflowId: OTHER_WORKFLOW,
    userId: USER,
    triggerData: { date: "03/15/2026" },
    status: "failed",
  });
  await db!.insert(stepAttempts).values({
    id: MISMATCHED_ATTEMPT,
    runId: MISMATCHED_RUN,
    attemptNo: 1,
    status: "failed",
    configSnapshot: failedConfig,
    idempotencyKey: `${MISMATCHED_RUN}:action:1`,
    errorStd: {
      category_hint: "invalid_value",
      code: "badRequest",
      message: "Bad Request",
      field: "start",
      retryable: false,
      outcome: "not_executed",
    },
  });
}

describe.skipIf(!scratchEnabled)("diagnosis persistence on a real database (scratch only)", () => {
  beforeEach(seed);

  it("loads the latest owned attempt while keeping failed and current configs separate", async () => {
    const store = createDrizzleDiagnosisStore(db!);
    const context = await store.getContext(RUN, USER);

    expect(context?.attempt.id).toBe(LATEST_ATTEMPT);
    expect(context?.attempt.configSnapshot).toEqual(failedConfig);
    expect(context?.workflow.currentConfig).toEqual(currentConfig);
    expect(context?.workflow.configVersion).toBe(2);
    expect(context?.attempt.error).toMatchObject({ category_hint: "invalid_value", field: "start" });
    expect(await store.getContext(RUN, OTHER_USER)).toBeUndefined();
    expect(await store.getContext(MISMATCHED_RUN, USER)).toBeUndefined();
  });

  it("refuses to diagnose when the newest attempt did not fail", async () => {
    await db!.insert(stepAttempts).values({
      runId: RUN,
      attemptNo: 3,
      status: "succeeded",
      configSnapshot: failedConfig,
      idempotencyKey: `${RUN}:action:3`,
    });
    const store = createDrizzleDiagnosisStore(db!);
    await expect(store.getContext(RUN, USER)).resolves.toBeUndefined();
  });

  it("saves a diagnosis and only returns it to the run owner", async () => {
    const store = createDrizzleDiagnosisStore(db!);
    const saved = await store.insert(USER, {
      attemptId: LATEST_ATTEMPT,
      category: "invalid_format",
      supported: true,
      evidence: [{ label: "Failing field", value: "Start" }],
      candidates: [
        {
          id: "transform:start:MM/DD/YYYY",
          kind: "config_change",
          fieldPath: "actionConfig.start",
          proposedValue: {
            kind: "mapped",
            source: "date",
            transform: { kind: "date_to_rfc3339", fromFormat: "MM/DD/YYYY", timeZone: "UTC" },
          },
          description: "Convert Start from MM/DD/YYYY to RFC 3339",
        },
      ],
      ceiling: "high",
      aiStatus: "unavailable",
      ai: null,
      confidence: null,
      model: null,
    });

    await expect(store.get(saved.id, USER)).resolves.toEqual(saved);
    await expect(store.get(saved.id, OTHER_USER)).resolves.toBeUndefined();
  });

  it("refuses to save a diagnosis for another user's attempt", async () => {
    const store = createDrizzleDiagnosisStore(db!);
    const input = {
      attemptId: MISMATCHED_ATTEMPT,
      category: "invalid_format" as const,
      supported: true,
      evidence: [{ label: "Failing field", value: "Start" }],
      candidates: [],
      ceiling: "low" as const,
      aiStatus: "unavailable" as const,
      ai: null,
      confidence: null,
      model: null,
    };

    await expect(store.insert(USER, input)).rejects.toMatchObject({ code: "not_found" });
  });
});
