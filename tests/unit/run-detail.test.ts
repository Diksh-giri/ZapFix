import { describe, expect, it } from "vitest";
import { initialRunDetailState, runDetailReducer, shouldPollRun } from "@/lib/run-detail";
import { loadRun, RunRequestError } from "@/lib/runs-client";
import type { RunView } from "@/lib/schemas/runs";

const view = (status: RunView["run"]["status"]): RunView => ({
  run: {
    id: "run-1",
    workflowId: "workflow-1",
    userId: "user-1",
    triggerData: { email: "person@example.com" },
    status,
    repairCount: 0,
    startedAt: "2026-09-28T12:00:00.000Z",
  },
  attempts: [],
});

describe("runDetailReducer", () => {
  it("moves from selection to a loaded running view", () => {
    const selected = runDetailReducer(initialRunDetailState, { type: "selected", runId: "run-1" });
    expect(selected).toMatchObject({ status: "loading", runId: "run-1", view: null });

    const ready = runDetailReducer(selected, { type: "load_succeeded", view: view("running") });
    expect(ready).toMatchObject({ status: "ready", runId: "run-1" });
    expect(shouldPollRun(ready)).toBe(true);
  });

  it("keeps the last view visible during refresh and a recoverable failure", () => {
    const ready = runDetailReducer(
      { status: "loading", runId: "run-1", view: null, error: null },
      { type: "load_succeeded", view: view("running") },
    );
    const refreshing = runDetailReducer(ready, { type: "load_started" });
    const failed = runDetailReducer(refreshing, { type: "load_failed", message: "Try again." });

    expect(refreshing.view).toEqual(ready.view);
    expect(failed).toMatchObject({ status: "error", error: "Try again.", view: ready.view });
  });

  it("stops polling when the run completes", () => {
    const ready = runDetailReducer(
      { status: "loading", runId: "run-1", view: null, error: null },
      { type: "load_succeeded", view: view("succeeded") },
    );
    expect(shouldPollRun(ready)).toBe(false);
  });
});

describe("loadRun", () => {
  it("validates the run response", async () => {
    const fetchRequest = async () => Response.json(view("failed"));
    await expect(loadRun("run-1", fetchRequest)).resolves.toEqual(view("failed"));
  });

  it("rejects invalid data and preserves API errors", async () => {
    const invalid = async () => Response.json({ run: { id: "run-1" } });
    await expect(loadRun("run-1", invalid)).rejects.toMatchObject<Partial<RunRequestError>>({ code: "invalid_response" });

    const denied = async () => Response.json(
      { error: { code: "not_found", message: "Run not found." } },
      { status: 404 },
    );
    await expect(loadRun("run-1", denied)).rejects.toMatchObject<Partial<RunRequestError>>({
      code: "not_found",
      message: "Run not found.",
    });
  });
});
