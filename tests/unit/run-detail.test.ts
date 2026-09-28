import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RunEvidence } from "@/components/RunDetail";
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
  latestDiagnosisId: null,
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

describe("RunEvidence", () => {
  it.each([
    ["running", "Running"],
    ["succeeded", "Succeeded"],
    ["failed", "Failed"],
    ["uncertain", "Outcome uncertain"],
  ] as const)("labels a %s action with text", (status, label) => {
    const data = view(status);
    data.attempts = [{
      id: "attempt-1",
      runId: "run-1",
      stepKey: "action",
      attemptNo: 1,
      status,
      configSnapshot: {},
      idempotencyKey: "hidden-key",
      startedAt: "2026-09-28T12:00:00.000Z",
    }];
    const html = renderToStaticMarkup(createElement(RunEvidence, { view: data }));
    expect(html).toContain(`Overall status: <strong>${label}</strong>`);
    expect(html).toContain("Form submission received.");
    expect(html).toContain(`Status: <strong>${status === "uncertain" ? "Outcome uncertain: check the app before retrying" : label}`);
  });

  it("shows submitted data, sanitized original error, and chronological attempts without internal fields", () => {
    const data = view("failed");
    data.run.triggerData = { title: "Planning", email: "person@example.com", notes: "" };
    data.attempts = [
      {
        id: "attempt-2", runId: "run-1", stepKey: "action", attemptNo: 2, status: "failed",
        configSnapshot: { title: { kind: "static", value: "secret config" } },
        errorRaw: { message: "unsafe raw value" }, idempotencyKey: "hidden-key-2",
        startedAt: "2026-09-28T12:02:00.000Z", finishedAt: "2026-09-28T12:03:00.000Z",
      },
      {
        id: "attempt-1", runId: "run-1", stepKey: "action", attemptNo: 1, status: "failed",
        configSnapshot: {}, idempotencyKey: "hidden-key-1",
        errorStd: {
          category_hint: "missing_field", code: "missing_required_field",
          message: "An email address is required.", field: "attendee_email",
          retryable: false, outcome: "not_executed",
        },
        startedAt: "2026-09-28T12:00:00.000Z", finishedAt: "2026-09-28T12:01:00.000Z",
      },
    ];

    const html = renderToStaticMarkup(createElement(RunEvidence, { view: data }));
    expect(html).toContain("Data used for this run");
    expect(html).toContain("person@example.com");
    expect(html).toContain("Empty");
    expect(html).toContain("Original error from the app");
    expect(html).toContain("An email address is required.");
    expect(html).toContain("missing_required_field");
    expect(html.indexOf("Attempt 1")).toBeLessThan(html.indexOf("Attempt 2"));
    expect(html).not.toContain("unsafe raw value");
    expect(html).not.toContain("secret config");
    expect(html).not.toContain("hidden-key");
    expect(html).not.toContain("attempt-1");
    expect(html).not.toContain("run-1");
  });

  it("warns that an uncertain action may already have occurred", () => {
    const data = view("uncertain");
    const html = renderToStaticMarkup(createElement(RunEvidence, { view: data }));
    expect(html).toContain("may already have occurred");
    expect(html).toContain("Check the connected app before retrying");
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
