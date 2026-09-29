import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalDialog } from "@/components/ApprovalDialog";
import { DebuggerPanel, defaultProposalOption } from "@/components/DebuggerPanel";
import type { DiagnosisView } from "@/lib/schemas/diagnosis";
import { ProposalViewSchema, type ApprovalSummaryView, type ProposalView } from "@/lib/schemas/proposals";

const summary: ApprovalSummaryView = {
  failedStep: "create_event",
  originalError: "missing_required_field: attendee email is required",
  likelyCause: "The attendee email is empty.",
  evidence: [{ label: "Failing field", value: "Attendee email" }],
  fieldPath: "actionConfig.attendee_email",
  currentValue: { kind: "mapped", source: "email" },
  proposedValue: { kind: "mapped", source: "contact_email" },
  expectedEffect: "Changes one setting. This may fix the error.",
  confidence: "medium",
  uncertaintyNote: "The next run may still fail for a different reason.",
};

const proposal: ProposalView = {
  id: "proposal-1",
  kind: "config_change",
  status: "pending",
  baseConfigVersion: 4,
  expectedEffect: summary.expectedEffect,
  options: [
    { id: "option-1", description: "Use contact email", fieldPath: summary.fieldPath, isDefault: true, summary, summaryHash: "a".repeat(64) },
    { id: "option-2", description: "Use work email", fieldPath: summary.fieldPath, isDefault: false, summary: { ...summary, proposedValue: { kind: "mapped", source: "work_email" } }, summaryHash: "b".repeat(64) },
  ],
};

const diagnosis: DiagnosisView = {
  id: "diagnosis-1", attemptId: "attempt-1", category: "missing_required_field", supported: true,
  evidence: summary.evidence,
  candidates: [], ceiling: "medium", aiStatus: "ok",
  ai: { likely_cause: summary.likelyCause, explanation: "The action needs an email.", selected_candidate_id: "option-1", why_this_fix: "Another email field is available.", confidence: "medium", uncertainty_note: summary.uncertaintyNote },
  confidence: "medium", model: "test", createdAt: "2026-09-28T12:00:00.000Z",
};

const noop = () => {};

describe("T19 debugger panel", () => {
  it("validates the complete browser-safe proposal shape", () => {
    expect(ProposalViewSchema.parse(proposal)).toEqual(proposal);
    expect(defaultProposalOption(proposal)?.id).toBe("option-1");
  });

  it("separates system evidence from AI text and offers only valid options", () => {
    const html = renderToStaticMarkup(createElement(DebuggerPanel, {
      diagnosis, proposal, selectedOptionId: "option-1", dialogOpen: false, busy: false, error: null,
      onSelectOption: noop, onOpenDialog: noop, onCloseDialog: noop, onConfirm: noop, onReject: noop, onExit: noop,
    }));
    expect(html).toContain("Confirmed by the system");
    expect(html).toContain("AI-generated explanation");
    expect(html).toContain("Confidence: Medium");
    expect(html).toContain("Use contact email");
    expect(html).toContain("Use work email");
    expect(html).toContain("No change will be made unless you confirm");
    expect(html).not.toContain("will fix the error");
  });

  it("repeats the exact approval summary and all four decisions", () => {
    const html = renderToStaticMarkup(createElement(ApprovalDialog, { open: true, summary, onConfirm: noop, onChooseDifferent: noop, onReject: noop, onExit: noop }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain(summary.originalError);
    expect(html).toContain(summary.likelyCause);
    expect(html).toContain("Form field: email");
    expect(html).toContain("Form field: contact_email");
    for (const label of ["Confirm", "Choose a different option", "Reject", "Exit"]) expect(html).toContain(label);
  });

  it("routes reconnect guidance outside the approval flow and hides low-confidence fixes", () => {
    const reconnect = renderToStaticMarkup(createElement(DebuggerPanel, {
      diagnosis, proposal: { ...proposal, kind: "reconnect_guidance", options: [] }, selectedOptionId: "", dialogOpen: false, busy: false, error: null,
      onSelectOption: noop, onOpenDialog: noop, onCloseDialog: noop, onConfirm: noop, onReject: noop, onExit: noop,
    }));
    expect(reconnect).toContain('href="/connections"');
    expect(reconnect).not.toContain("Review and confirm");

    const low = renderToStaticMarkup(createElement(DebuggerPanel, {
      diagnosis: { ...diagnosis, confidence: "low" }, proposal, selectedOptionId: "option-1", dialogOpen: false, busy: false, error: null,
      onSelectOption: noop, onOpenDialog: noop, onCloseDialog: noop, onConfirm: noop, onReject: noop, onExit: noop,
    }));
    expect(low).toBe("");
  });
});
