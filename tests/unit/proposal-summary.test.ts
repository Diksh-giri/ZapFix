import { describe, expect, it } from "vitest";
import { buildApprovalSummary, describeEffect, summaryHash } from "@/server/proposals/summary";
import type { DiagnosisInput } from "@/server/proposals/types";
import type { ActionConfig } from "@/lib/schemas/workflow-config";

const config: ActionConfig = {
  title: { kind: "static", value: "Kickoff" },
  attendee_email: { kind: "mapped", source: "email" },
};

const diagnosis: DiagnosisInput = {
  id: "diag-1",
  category: "missing_required_field",
  supported: true,
  evidence: [{ label: "Failing field", value: "Attendee email" }],
  candidates: [],
  ceiling: "high",
  aiStatus: "ok",
  ai: {
    likely_cause: "The email field was left empty.",
    explanation: "The form's email box had no value when the run started.",
    selected_candidate_id: "map:attendee_email:contact_email",
    why_this_fix: "Contact email has a value.",
    confidence: "high",
    uncertainty_note: null,
  },
  confidence: "high",
};

const option = { fieldPath: "actionConfig.attendee_email", proposedValue: { kind: "mapped" as const, source: "contact_email" } };
const failure = { stepKey: "create_event", originalError: "missing_required_field: attendee_email is required" };

describe("buildApprovalSummary", () => {
  it("shows exactly what will change, taken from the stored data", () => {
    const s = buildApprovalSummary({ failure, diagnosis, config, option });
    expect(s).toEqual({
      failedStep: "create_event",
      originalError: "missing_required_field: attendee_email is required",
      likelyCause: "The email field was left empty.",
      evidence: [{ label: "Failing field", value: "Attendee email" }],
      fieldPath: "actionConfig.attendee_email",
      currentValue: { kind: "mapped", source: "email" },
      proposedValue: { kind: "mapped", source: "contact_email" },
      expectedEffect: describeEffect(
        "actionConfig.attendee_email",
        { kind: "mapped", source: "email" },
        { kind: "mapped", source: "contact_email" },
      ),
      confidence: "high",
      uncertaintyNote: null,
    });
  });

  it("says 'may fix', never 'will fix'", () => {
    const text = describeEffect(option.fieldPath, config.attendee_email, option.proposedValue);
    expect(text).toMatch(/may fix/i);
    expect(text).not.toMatch(/will fix/i);
    expect(text).toContain("attendee_email");
  });

  it("describes a fixed value and a transform in plain words", () => {
    const text = describeEffect(
      "actionConfig.start",
      { kind: "static", value: "tomorrow" },
      { kind: "mapped", source: "date", transform: { kind: "date_to_rfc3339", fromFormat: "MM/DD/YYYY", timeZone: "UTC" } },
    );
    expect(text).toContain("tomorrow");
    expect(text).toContain('"date"');
    expect(text).toMatch(/MM\/DD\/YYYY/);
  });

  it("uses null when the field is not in the settings, so the hash survives a database round trip", () => {
    const s = buildApprovalSummary({
      failure,
      diagnosis,
      config: { title: { kind: "static", value: "Kickoff" } },
      option,
    });
    expect(s.currentValue).toBeNull();
    const roundTripped = JSON.parse(JSON.stringify(s));
    expect(summaryHash(roundTripped)).toBe(summaryHash(s));
  });

  it("gives the same hash for the same inputs and a different one when anything shown changes", () => {
    const a = summaryHash(buildApprovalSummary({ failure, diagnosis, config, option }));
    expect(summaryHash(buildApprovalSummary({ failure, diagnosis, config, option }))).toBe(a);

    const otherValue = { ...option, proposedValue: { kind: "mapped" as const, source: "other" } };
    expect(summaryHash(buildApprovalSummary({ failure, diagnosis, config, option: otherValue }))).not.toBe(a);

    const otherConfig = { ...config, attendee_email: { kind: "mapped" as const, source: "changed_by_hand" } };
    expect(summaryHash(buildApprovalSummary({ failure, diagnosis, config: otherConfig, option }))).not.toBe(a);
  });

  it("carries the AI's uncertainty note", () => {
    const d = { ...diagnosis, ai: { ...diagnosis.ai!, uncertainty_note: "Two fields looked similar." } };
    expect(buildApprovalSummary({ failure, diagnosis: d, config, option }).uncertaintyNote).toBe("Two fields looked similar.");
  });

  it("refuses to build a summary without a valid AI answer and a confidence", () => {
    expect(() => buildApprovalSummary({ failure, diagnosis: { ...diagnosis, ai: null }, config, option })).toThrow();
    expect(() => buildApprovalSummary({ failure, diagnosis: { ...diagnosis, confidence: null }, config, option })).toThrow();
  });

  it("refuses an unsupported field path or an invalid proposed value", () => {
    expect(() => buildApprovalSummary({ failure, diagnosis, config, option: { ...option, fieldPath: "trigger.email" } })).toThrow();
    expect(() =>
      buildApprovalSummary({ failure, diagnosis, config, option: { ...option, proposedValue: { kind: "nope" } as never } }),
    ).toThrow();
  });
});
