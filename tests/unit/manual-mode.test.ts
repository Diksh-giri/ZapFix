import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ManualMode, ReturnToEditorButton } from "@/components/ManualMode";
import { canRetryDiagnosis, manualModeReason, manualModeTip, type ManualModeReason } from "@/lib/manual-mode";
import type { DiagnosisView } from "@/lib/schemas/diagnosis";

const diagnosis: DiagnosisView = {
  id: "diagnosis-1",
  attemptId: "attempt-1",
  category: "missing_required_field",
  supported: true,
  evidence: [{ label: "Required field", value: "Attendee email is empty" }],
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

const originalError = {
  category_hint: "missing_field" as const,
  code: "missing_required_field",
  message: "An attendee email is required.",
  field: "attendee_email",
  retryable: false,
  outcome: "not_executed" as const,
};

describe("manualModeReason", () => {
  it.each<[ManualModeReason, DiagnosisView]>([
    ["unsupported", { ...diagnosis, supported: false }],
    ["unsupported", { ...diagnosis, category: "unsupported" as const }],
    ["low_confidence", { ...diagnosis, confidence: "low" as const }],
    ["no_candidates", { ...diagnosis, candidates: [] }],
    ["ai_unavailable", { ...diagnosis, aiStatus: "unavailable" as const }],
    ["ai_invalid", { ...diagnosis, aiStatus: "invalid" as const }],
  ])("selects %s when the diagnosis cannot offer a safe change", (reason, input) => {
    expect(manualModeReason(input)).toBe(reason);
  });

  it("gives the repair limit priority and otherwise leaves a safe diagnosis alone", () => {
    expect(manualModeReason(diagnosis, true)).toBe("repair_limit_reached");
    expect(manualModeReason(diagnosis)).toBeNull();
    expect(manualModeReason(null)).toBeNull();
  });

  it("allows another diagnosis only after an AI failure", () => {
    expect(canRetryDiagnosis("ai_unavailable")).toBe(true);
    expect(canRetryDiagnosis("ai_invalid")).toBe(true);
    expect(canRetryDiagnosis("unsupported")).toBe(false);
    expect(canRetryDiagnosis("repair_limit_reached")).toBe(false);
  });
});

describe("manual mode guidance", () => {
  it.each([
    ["missing_required_field", "form field feeding this setting"],
    ["invalid_format", "format the app expects"],
    ["expired_connection", "Reconnect the app"],
    ["unsupported", "status page"],
  ] as const)("provides fixed guidance for %s", (category, expected) => {
    expect(manualModeTip(category)).toContain(expected);
  });

  const render = (reason: ManualModeReason, input: DiagnosisView | null = diagnosis) => renderToStaticMarkup(
    createElement(ManualMode, {
      reason,
      diagnosis: input,
      originalError,
      onRetryDiagnosis: () => {},
      onReturnToEditor: () => {},
    }),
  );

  it("shows the original error, confirmed evidence, fixed help, and editor button", () => {
    const html = render("low_confidence");

    expect(html).toContain("Continue manually");
    expect(html).toContain("An attendee email is required.");
    expect(html).toContain("missing_required_field");
    expect(html).toContain("Confirmed by the system");
    expect(html).toContain("Attendee email is empty");
    expect(html).toContain("form field feeding this setting");
    expect(html).toContain(">Return to workflow editor</button>");
    expect(html).not.toContain('href="/workflows/workflow-1"');
    expect(html).toContain("No change has been made.");
  });

  it("fires the return-to-editor callback", () => {
    const onReturnToEditor = vi.fn();
    const button = ReturnToEditorButton({ onReturnToEditor });

    button.props.onClick();
    expect(onReturnToEditor).toHaveBeenCalledOnce();
  });

  it.each(["ai_unavailable", "ai_invalid"] as const)("offers another diagnosis for %s", (reason) => {
    expect(render(reason)).toContain("Try diagnosis again");
  });

  it.each(["unsupported", "low_confidence", "no_candidates", "repair_limit_reached"] as const)(
    "does not offer another diagnosis for %s",
    (reason) => expect(render(reason)).not.toContain("Try diagnosis again"),
  );

  it("renders repair-limit help without requiring a diagnosis record", () => {
    const html = render("repair_limit_reached", null);
    expect(html).toContain("repair limit");
    expect(html).toContain("status page");
  });

  it("never renders proposal or approval controls", () => {
    for (const reason of ["unsupported", "low_confidence", "no_candidates", "ai_unavailable", "ai_invalid", "repair_limit_reached"] as const) {
      const html = render(reason, reason === "repair_limit_reached" ? null : diagnosis);
      expect(html).not.toMatch(/proposed change|>approve<|>confirm<|>apply change</i);
    }
  });
});
