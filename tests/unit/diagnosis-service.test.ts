import { describe, expect, it, vi } from "vitest";
import { fakeAdapter } from "@/server/adapters/fake";
import type { AuditStore, StoredEvent } from "@/server/audit/store";
import { AiCallError } from "@/server/diagnosis/ai/client";
import type { DiagnosisRecord, DiagnosisStore, NewDiagnosis } from "@/server/diagnosis/store";
import { diagnoseRun } from "@/server/diagnosis/service";
import { createMemoryProposalStore } from "@/server/proposals/memory-store";

function setup(repairCount = 0) {
  let saved: DiagnosisRecord | undefined;
  const store: DiagnosisStore = {
    async getContext() {
      return {
        run: {
          id: "run-1",
          userId: "user-1",
          workflowId: "workflow-1",
          triggerData: { email: "", backup_email: "backup@example.com" },
          repairCount,
        },
        attempt: {
          id: "attempt-1",
          stepKey: "create_event",
          status: "failed",
          configSnapshot: {
            title: { kind: "static", value: "Kickoff" },
            start: { kind: "static", value: "2026-03-15T09:00:00Z" },
            end: { kind: "static", value: "2026-03-15T10:00:00Z" },
            attendee_email: { kind: "mapped", source: "email" },
          },
          error: {
            category_hint: "missing_field",
            code: "required",
            message: "Missing required attendee email.",
            field: "attendee_email",
            retryable: false,
            outcome: "not_executed",
          },
        },
        workflow: {
          id: "workflow-1",
          app: "google_calendar",
          actionKey: "create_event",
          triggerSchema: {
            fields: [
              { key: "email", label: "Email", type: "email" },
              { key: "backup_email", label: "Backup email", type: "email" },
            ],
          },
          currentConfig: {
            title: { kind: "static", value: "Kickoff" },
            start: { kind: "static", value: "2026-03-15T09:00:00Z" },
            end: { kind: "static", value: "2026-03-15T10:00:00Z" },
            attendee_email: { kind: "mapped", source: "email" },
          },
          configVersion: 3,
        },
      };
    },
    async insert(userId: string, input: NewDiagnosis) {
      expect(userId).toBe("user-1");
      saved = { ...input, id: "diagnosis-1", createdAt: new Date("2026-09-28T12:00:00Z") };
      return saved;
    },
    async get() {
      return saved;
    },
  };
  const events: StoredEvent[] = [];
  const audit: AuditStore = {
    async insertEvent(event) {
      events.push(event);
    },
    async hasEvent() {
      return false;
    },
    async incrementRateLimit() {
      return 1;
    },
    async runOwnedBy() {
      return true;
    },
  };
  const aiClient = {
    complete: vi.fn(async () =>
      JSON.stringify({
        likely_cause: "The attendee email was empty.",
        explanation: "The selected trigger field did not contain an email address.",
        selected_candidate_id: "map:attendee_email:backup_email",
        why_this_fix: "Backup email has a value.",
        confidence: "high",
        uncertainty_note: null,
      }),
    ),
  };
  return { store, audit, events, aiClient, proposals: createMemoryProposalStore() };
}

describe("diagnoseRun", () => {
  it("classifies, saves, proposes, hashes, and records safe lifecycle events", async () => {
    const deps = setup();
    const result = await diagnoseRun(
      {
        ...deps,
        adapterFor: () => fakeAdapter,
        now: () => new Date("2026-09-28T12:00:00Z"),
        timeoutMs: 1000,
        model: "test-model",
      },
      { runId: "run-1", userId: "user-1" },
    );

    expect(result.diagnosis).toMatchObject({ category: "missing_required_field", model: "test-model" });
    expect(result.proposal?.options[0]?.summaryHash).toHaveLength(64);
    expect(deps.aiClient.complete).toHaveBeenCalledOnce();
    expect(deps.events.map((event) => event.type)).toEqual(["diagnosis_requested", "diagnosis_ready"]);
  });

  it("stops at the repair limit before calling the AI or saving", async () => {
    const deps = setup(2);
    await expect(
      diagnoseRun(
        {
          ...deps,
          adapterFor: () => fakeAdapter,
          now: () => new Date("2026-09-28T12:00:00Z"),
          timeoutMs: 1000,
          model: "test-model",
        },
        { runId: "run-1", userId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "repair_limit_reached" });
    expect(deps.aiClient.complete).not.toHaveBeenCalled();
    expect(deps.events.map((event) => event.type)).toEqual(["repair_limit_reached"]);
  });

  it("saves manual mode and creates no proposal when the AI is unavailable", async () => {
    const deps = setup();
    deps.aiClient.complete.mockRejectedValue(new AiCallError("no_key", false));
    const result = await diagnoseRun(
      {
        ...deps,
        adapterFor: () => fakeAdapter,
        now: () => new Date("2026-09-28T12:00:00Z"),
        timeoutMs: 1000,
        model: "test-model",
      },
      { runId: "run-1", userId: "user-1" },
    );

    expect(result.diagnosis).toMatchObject({ aiStatus: "unavailable", ai: null, model: null });
    expect(result.proposal).toBeNull();
  });

  it("enforces the diagnosis rate limit before calling the AI", async () => {
    const deps = setup();
    deps.audit.incrementRateLimit = async () => 31;
    await expect(
      diagnoseRun(
        {
          ...deps,
          adapterFor: () => fakeAdapter,
          now: () => new Date("2026-09-28T12:00:00Z"),
          timeoutMs: 1000,
          model: "test-model",
        },
        { runId: "run-1", userId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(deps.aiClient.complete).not.toHaveBeenCalled();
  });
});
