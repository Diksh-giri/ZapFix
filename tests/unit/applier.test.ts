import { describe, expect, it } from "vitest";
import {
  applyFieldChange,
  assertChangeMatchesApproval,
  fieldKeyFromPath,
  hasManualEditConflict,
} from "@/server/changes/applier";
import { summaryHash, type ApprovalSummary } from "@/server/proposals/summary";
import type { ActionConfig } from "@/lib/schemas/workflow-config";

const config: ActionConfig = {
  title: { kind: "static", value: "Kickoff" },
  attendee_email: { kind: "mapped", source: "email" },
};

describe("applyFieldChange (safety test 2)", () => {
  it("changes exactly one field and does not mutate the input", () => {
    const next = applyFieldChange(config, "actionConfig.attendee_email", { kind: "mapped", source: "contact_email" });
    expect(next.attendee_email).toEqual({ kind: "mapped", source: "contact_email" });
    expect(next.title).toEqual(config.title);
    expect(config.attendee_email).toEqual({ kind: "mapped", source: "email" });
  });

  it("rejects unsupported paths and invalid values", () => {
    expect(() => fieldKeyFromPath("trigger.email")).toThrow();
    expect(() => fieldKeyFromPath("actionConfig.")).toThrow();
    expect(() => applyFieldChange(config, "actionConfig.title", { kind: "nope" })).toThrow();
  });
});

describe("assertChangeMatchesApproval", () => {
  const approved = { fieldPath: "actionConfig.attendee_email", value: { kind: "mapped", source: "contact_email" } };

  it("passes for an identical change, regardless of key order", () => {
    expect(() =>
      assertChangeMatchesApproval(approved, { fieldPath: approved.fieldPath, value: { source: "contact_email", kind: "mapped" } }),
    ).not.toThrow();
  });

  it("blocks a different value or a different field", () => {
    expect(() => assertChangeMatchesApproval(approved, { fieldPath: approved.fieldPath, value: { kind: "mapped", source: "other" } })).toThrow();
    expect(() => assertChangeMatchesApproval(approved, { fieldPath: "actionConfig.title", value: approved.value })).toThrow();
  });
});

describe("restore conflict (safety test 6)", () => {
  it("detects a manual edit after the debugger's change", () => {
    const applied = { kind: "mapped", source: "contact_email" };
    expect(hasManualEditConflict({ source: "contact_email", kind: "mapped" }, applied)).toBe(false);
    expect(hasManualEditConflict({ kind: "static", value: "me@x.com" }, applied)).toBe(true);
  });
});

describe("summaryHash", () => {
  const summary: ApprovalSummary = {
    failedStep: "Create event",
    originalError: "required: Missing required field: attendee_email",
    likelyCause: "Empty email",
    evidence: [{ label: "Value received", value: "empty" }],
    fieldPath: "actionConfig.attendee_email",
    currentValue: { kind: "mapped", source: "email" },
    proposedValue: { kind: "mapped", source: "contact_email" },
    expectedEffect: "The event may now be created with an attendee.",
    confidence: "high",
    uncertaintyNote: null,
  };

  it("is stable and changes when anything shown changes", () => {
    expect(summaryHash(summary)).toBe(summaryHash({ ...summary }));
    expect(summaryHash(summary)).toHaveLength(64);
    expect(summaryHash({ ...summary, proposedValue: { kind: "mapped", source: "other" } })).not.toBe(summaryHash(summary));
  });
});
