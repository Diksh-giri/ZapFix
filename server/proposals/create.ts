import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { planProposal } from "./plan";
import type { ProposalStore } from "./store";
import type { DiagnosisInput, ProposalRecord } from "./types";

/**
 * Turns a diagnosis into a saved proposal, or into nothing when no fix should be offered.
 * Either way the workflow's older pending proposal is retired, because it belongs to an older diagnosis.
 */
export async function createProposal(
  deps: { store: ProposalStore },
  input: { diagnosis: DiagnosisInput; workflowId: string; config: ActionConfig; configVersion: number },
): Promise<ProposalRecord | null> {
  const draft = planProposal(input);
  return deps.store.replacePending(input.workflowId, draft);
}
