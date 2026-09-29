import { deepEqual } from "@/lib/canonical";
import { AppError } from "@/lib/errors";
import { recordEvent } from "@/server/audit/events";
import { loadPendingProposal } from "./guards";
import type { ProposalStore } from "./store";
import { buildApprovalSummary, summaryHash } from "./summary";
import type { ChangeOption } from "./types";

const OUTDATED = "This proposal is out of date. Request a new diagnosis.";

/**
 * The user rejected the proposal or exited without deciding. Nothing about the workflow changes:
 * we only keep the record of what they were shown and what they chose (one decision per proposal).
 */
export async function decideProposal(
  deps: { store: ProposalStore; now: () => Date },
  input: { proposalId: string; userId: string; decision: "rejected" | "exited"; selectedOptionId?: string; expectedConfigVersion: number; summaryHash: string },
): Promise<{ status: "decided" }> {
  type Outcome = { ok: true; result: { status: "decided" } } | { ok: false; error: AppError };
  const outcome: Outcome = await deps.store.transaction(async (tx): Promise<Outcome> => {
    const { proposal, workflow, diagnosis, failure, runId } = await loadPendingProposal(tx, input.proposalId, input.userId);

    if (workflow.configVersion !== proposal.baseConfigVersion) {
      await tx.setProposalStatus(proposal.id, "expired");
      return { ok: false, error: new AppError("proposal_outdated", OUTDATED) };
    }
    if (input.expectedConfigVersion !== workflow.configVersion) {
      throw new AppError("proposal_outdated", OUTDATED);
    }
    const proposed: ChangeOption = { fieldPath: proposal.fieldPath!, proposedValue: proposal.proposedValue! };
    let option = proposed;
    if (input.selectedOptionId !== undefined) {
      const picked = proposal.validOptions.find((candidate) => candidate.id === input.selectedOptionId);
      if (!picked?.fieldPath || !picked.proposedValue) throw new AppError("validation_failed", "That option is not one of the valid choices for this proposal.");
      option = { fieldPath: picked.fieldPath, proposedValue: picked.proposedValue };
    }
    const summary = buildApprovalSummary({ failure, diagnosis, config: workflow.config, option });
    if (summaryHash(summary) !== input.summaryHash) throw new AppError("proposal_outdated", OUTDATED);

    await tx.insertApproval({
      proposalId: proposal.id,
      userId: input.userId,
      decision: input.decision,
      approvedFieldPath: null,
      approvedValue: null,
      wasEdited: !deepEqual(option, proposed),
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
    return { ok: true, result: { status: "decided" as const } };
  });
  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}
