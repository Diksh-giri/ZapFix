import { describe, expect, it } from "vitest";
import { loadDiagnosis, requestDiagnosis, RunRequestError } from "@/lib/runs-client";
import type { DiagnosisView } from "@/lib/schemas/diagnosis";

const diagnosis: DiagnosisView = {
  id: "diagnosis-1",
  attemptId: "attempt-1",
  category: "missing_required_field",
  supported: true,
  evidence: [{ label: "Missing field", value: "Attendee email" }],
  candidates: [{
    id: "map:attendee_email:contact_email",
    kind: "config_change",
    fieldPath: "actionConfig.attendee_email",
    proposedValue: { kind: "mapped", source: "contact_email" },
    description: "Use contact email",
  }],
  ceiling: "high",
  aiStatus: "ok",
  ai: {
    likely_cause: "The attendee email is empty.",
    explanation: "The calendar action needs an attendee email.",
    selected_candidate_id: "map:attendee_email:contact_email",
    why_this_fix: "The form contains another email field.",
    confidence: "high",
    uncertainty_note: null,
  },
  confidence: "high",
  model: "test-model",
  createdAt: "2026-09-28T12:00:00.000Z",
};

describe("diagnosis client", () => {
  it("loads and validates an owned diagnosis", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchRequest = async (input: string, init?: RequestInit) => {
      calls.push({ input, init });
      return Response.json(diagnosis);
    };

    await expect(loadDiagnosis("diagnosis-1", fetchRequest)).resolves.toEqual(diagnosis);
    expect(calls).toEqual([{
      input: "/api/diagnoses/diagnosis-1",
      init: { headers: { accept: "application/json" } },
    }]);
  });

  it("preserves the full diagnosis returned when diagnosis starts", async () => {
    const fetchRequest = async () => Response.json({ diagnosis, proposal: null });

    await expect(requestDiagnosis("run-1", fetchRequest)).resolves.toEqual({ diagnosis, proposal: null });
  });

  it.each([
    ["missing fields", { id: "diagnosis-1" }],
    ["unknown categories", { ...diagnosis, category: "invented" }],
    ["invalid evidence", { ...diagnosis, evidence: [{ label: "Missing value" }] }],
    ["invalid candidates", { ...diagnosis, candidates: [{ id: "unsafe", kind: "invented", description: "Unsafe" }] }],
    ["invalid AI status", { ...diagnosis, aiStatus: "pending" }],
  ])("rejects diagnosis responses with %s", async (_case, body) => {
    const fetchRequest = async () => Response.json(body);

    await expect(loadDiagnosis("diagnosis-1", fetchRequest)).rejects.toMatchObject<Partial<RunRequestError>>({
      code: "invalid_response",
    });
  });

  it("rejects an invalid diagnosis in the start response", async () => {
    const fetchRequest = async () => Response.json({ diagnosis: { id: "diagnosis-1" }, proposal: null });

    await expect(requestDiagnosis("run-1", fetchRequest)).rejects.toMatchObject<Partial<RunRequestError>>({
      code: "invalid_response",
    });
  });

  it("preserves API errors", async () => {
    const fetchRequest = async () => Response.json(
      { error: { code: "not_found", message: "Diagnosis not found." } },
      { status: 404 },
    );

    await expect(loadDiagnosis("diagnosis-1", fetchRequest)).rejects.toMatchObject<Partial<RunRequestError>>({
      code: "not_found",
      message: "Diagnosis not found.",
    });
  });
});
