import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RunActions, RunEvidence } from "@/components/RunDetail";
import {
  createExclusiveActionRunner,
  initialRunDetailState,
  runActionErrorMessage,
  runDetailReducer,
  shouldRecordFailureOpened,
  shouldPollRun,
} from "@/lib/run-detail";
import { loadRun, recordFailureOpened, requestDiagnosis, retryRun, RunRequestError } from "@/lib/runs-client";
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

describe("run action guards", () => {
  it("runs only one action while a request is active", async () => {
    const runner = createExclusiveActionRunner();
    let release = () => {};
    const first = runner(() => new Promise<void>((resolve) => { release = resolve; }));
    const second = runner(async () => {});
    await expect(second).resolves.toBe(false);
    release();
    await expect(first).resolves.toBe(true);
  });

  it("uses plain messages for expected action failures", () => {
    expect(runActionErrorMessage("repair_limit_reached", "fallback")).toContain("repair limit");
    expect(runActionErrorMessage("rate_limited", "fallback")).toContain("too many requests");
    expect(runActionErrorMessage("no_active_connection", "fallback")).toContain("Reconnect");
    expect(runActionErrorMessage("unknown", "fallback")).toBe("fallback");
  });

  it("releases the action guard after a failed request", async () => {
    const runner = createExclusiveActionRunner();
    await expect(runner(async () => { throw new Error("request failed"); })).rejects.toThrow("request failed");
    await expect(runner(async () => {})).resolves.toBe(true);
  });

  it("records failure-opened once per failed or uncertain run", () => {
    const opened = new Set<string>();
    expect(shouldRecordFailureOpened(opened, { id: "run-1", status: "running" })).toBe(false);
    expect(shouldRecordFailureOpened(opened, { id: "run-1", status: "failed" })).toBe(true);
    expect(shouldRecordFailureOpened(opened, { id: "run-1", status: "failed" })).toBe(false);
    expect(shouldRecordFailureOpened(opened, { id: "run-2", status: "uncertain" })).toBe(true);
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

describe("RunActions", () => {
  const render = (status: RunView["run"]["status"], overrides: Partial<Parameters<typeof RunActions>[0]> = {}) => {
    const data = view(status);
    data.attempts = [{
      id: "attempt-1", runId: "run-1", stepKey: "action", attemptNo: 1, status,
      configSnapshot: {}, idempotencyKey: "hidden", startedAt: "2026-09-28T12:00:00.000Z",
    }];
    return renderToStaticMarkup(createElement(RunActions, {
      view: data, busy: null, diagnosisId: null, confirmUncertain: false, error: null,
      onConfirmUncertain: () => {}, onDiagnose: () => {}, onRetry: () => {}, ...overrides,
    }));
  };

  it("offers no diagnosis or retry for running or successful actions", () => {
    expect(render("running")).toBe("");
    expect(render("succeeded")).toBe("");
  });

  it("offers guarded actions for a failure", () => {
    const html = render("failed");
    expect(html).toContain("Diagnose");
    expect(html).toContain("Retry");
    expect(html).not.toContain("confirm before retrying");
  });

  it("requires confirmation for an uncertain retry", () => {
    const html = render("uncertain");
    expect(html).toContain("may already have occurred");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retry<\/button>/);
    expect(render("uncertain", { confirmUncertain: true })).not.toMatch(/<button[^>]*disabled=""[^>]*>Retry<\/button>/);
  });

  it("uses an existing diagnosis instead of offering another request", () => {
    const html = render("failed", { diagnosisId: "diagnosis-1" });
    expect(html).toContain("Diagnosis ready.");
    expect(html).not.toContain(">Diagnose<");
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

  it("sends only approved retry, diagnosis, and event fields", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchRequest = async (input: string, init?: RequestInit) => {
      calls.push({ input, init });
      if (input.endsWith("/retry")) return Response.json(view("failed"));
      if (input.endsWith("/diagnosis")) return Response.json({ diagnosis: { id: "diagnosis-1" }, proposal: null });
      return new Response(null, { status: 204 });
    };

    await retryRun("run-1", true, fetchRequest);
    await expect(requestDiagnosis("run-1", fetchRequest)).resolves.toBe("diagnosis-1");
    await recordFailureOpened("run-1", fetchRequest);

    expect(calls[0]).toMatchObject({ input: "/api/runs/run-1/retry", init: { method: "POST" } });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ confirmUncertain: true });
    expect(calls[1]).toMatchObject({ input: "/api/runs/run-1/diagnosis", init: { method: "POST" } });
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ type: "failure_opened", runId: "run-1" });
  });

  it("does not send uncertain confirmation for an ordinary failed retry", async () => {
    const calls: RequestInit[] = [];
    const fetchRequest = async (_input: string, init?: RequestInit) => {
      calls.push(init ?? {});
      return Response.json(view("failed"));
    };
    await retryRun("run-1", false, fetchRequest);
    expect(JSON.parse(String(calls[0]?.body))).toEqual({});
  });
});
