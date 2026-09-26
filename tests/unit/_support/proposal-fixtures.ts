import { AppError } from "@/lib/errors";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { createMemoryProposalStore } from "@/server/proposals/memory-store";
import { planProposal } from "@/server/proposals/plan";
import { buildApprovalSummary, summaryHash } from "@/server/proposals/summary";
import type { DiagnosisInput, FailureInput, ProposalRecord } from "@/server/proposals/types";
import type { Candidate } from "@/server/diagnosis/rules/types";

/** Shared scenario for the proposal decision, confirm and restore tests. */
export const config: ActionConfig = {
  title: { kind: "static", value: "Kickoff" },
  attendee_email: { kind: "mapped", source: "email" },
};
export const failure: FailureInput = { stepKey: "create_event", originalError: "missing_required_field: attendee_email is required" };
export const mapTo = (source: string): Candidate => ({
  id: `map:attendee_email:${source}`,
  kind: "config_change",
  fieldPath: "actionConfig.attendee_email",
  proposedValue: { kind: "mapped", source },
  description: `Use "${source}" for Attendee email`,
});
export const diagnosis: DiagnosisInput = {
  id: "diag-1",
  category: "missing_required_field",
  supported: true,
  evidence: [{ label: "Failing field", value: "Attendee email" }],
  candidates: [mapTo("contact_email"), mapTo("work_email")],
  ceiling: "medium",
  aiStatus: "ok",
  ai: {
    likely_cause: "The email field was empty.",
    explanation: "The form's email box had no value.",
    selected_candidate_id: "map:attendee_email:contact_email",
    why_this_fix: "Contact email has a value.",
    confidence: "medium",
    uncertainty_note: null,
  },
  confidence: "medium",
};

export const now = () => new Date("2026-09-26T12:00:00Z");
export const DEFAULT_ID = "map:attendee_email:contact_email";

export function setup(over: { proposal?: Partial<ProposalRecord>; userId?: string } = {}) {
  const store = createMemoryProposalStore();
  const draft = planProposal({ diagnosis, workflowId: "wf-1", config, configVersion: 4 })!;
  const proposal: ProposalRecord = { ...draft, id: "prop-1", status: "pending", createdAt: now(), ...over.proposal };
  store.seed({ proposal, workflow: { id: "wf-1", userId: over.userId ?? "user-1", config, configVersion: 4 }, diagnosis, failure, runId: "run-1" });
  return store;
}

/** The hash the screen would send: built from the same stored data the server uses. */
export function hashFor(optionId = DEFAULT_ID, cfg: ActionConfig = config) {
  const option = diagnosis.candidates.find((c) => c.id === optionId)!;
  return summaryHash(buildApprovalSummary({ failure, diagnosis, config: cfg, option: { fieldPath: option.fieldPath!, proposedValue: option.proposedValue! } }));
}


export async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "no error";
}
