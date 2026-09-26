import { recordEvent } from "@/server/audit/events";
import { loadPendingProposal } from "./guards";
import type { ProposalStore } from "./store";
import { buildApprovalSummary } from "./summary";

/**
 * The user rejected the proposal or exited without deciding. Nothing about the workflow changes:
 * we only keep the record of what they were shown and what they chose (one decision per proposal).
 */
export async function decideProposal(
  deps: { store: ProposalStore; now: () => Date },
  input: { proposalId: string; userId: string; decision: "rejected" | "exited" },
): Promise<{ status: "decided" }> {
  return deps.store.transaction(async (tx) => {
    const { proposal, workflow, diagnosis, failure, runId } = await loadPendingProposal(tx, input.proposalId, input.userId);

    const summary = buildApprovalSummary({
      failure,
      diagnosis,
      config: workflow.config,
      option: { fieldPath: proposal.fieldPath!, proposedValue: proposal.proposedValue! },
    });

    await tx.insertApproval({
      proposalId: proposal.id,
      userId: input.userId,
      decision: input.decision,
      approvedFieldPath: null,
      approvedValue: null,
      wasEdited: false,
      summaryShown: summary,
      decidedAt: deps.now(),
    });
    await tx.setProposalStatus(proposal.id, "decided");
    await recordEvent(tx.audit, {
      userId: input.userId,
      runId,
      type: "proposal_decided",
      payload: { proposal_id: proposal.id, decision: input.decision },
    });
    return { status: "decided" as const };
  });
}
