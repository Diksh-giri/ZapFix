import { deepEqual } from "@/lib/canonical";
import { AppError } from "@/lib/errors";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { recordEvent } from "@/server/audit/events";
import { applyFieldChange, assertChangeMatchesApproval, readFieldValue } from "@/server/changes/applier";
import { loadPendingProposal } from "./guards";
import type { ProposalStore } from "./store";
import { buildApprovalSummary, summaryHash } from "./summary";
import type { ChangeOption } from "./types";

const OUTDATED = "This proposal is out of date. Request a new diagnosis.";

export interface ConfirmResult {
  workflow: { id: string; configVersion: number; config: ActionConfig; lastModifiedBy: "debugger" };
  configChangeId: string;
  approvalId: string;
}

/**
 * Approve and apply, as ONE all-or-nothing transaction (TDD Appendix E). Nothing is saved unless every
 * step succeeds, and only the approved change is applied:
 *   1 load + ownership + still pending      2 settings version unchanged
 *   3 chosen option is on the valid list    4 summary hash equals what the server would show
 *   5 approval  6 config change  7 workflow update (+1 version)  8 proposal decided + events
 */
export async function confirmProposal(
  deps: { store: ProposalStore; now: () => Date },
  input: { proposalId: string; userId: string; selectedOptionId?: string; expectedConfigVersion: number; summaryHash: string },
): Promise<ConfirmResult> {
  type Outcome = { ok: true; result: ConfirmResult } | { ok: false; error: AppError };

  const outcome: Outcome = await deps.store.transaction(async (tx): Promise<Outcome> => {
    const { proposal, workflow, diagnosis, failure, runId } = await loadPendingProposal(tx, input.proposalId, input.userId);

    // 2. The settings must be exactly what the proposal was made against.
    if (workflow.configVersion !== proposal.baseConfigVersion) {
      // Edited by hand since: the proposal can never apply. Keep that fact, then refuse.
      await tx.setProposalStatus(proposal.id, "expired");
      return { ok: false, error: new AppError("proposal_outdated", OUTDATED) };
    }
    if (input.expectedConfigVersion !== workflow.configVersion) throw new AppError("proposal_outdated", OUTDATED);

    // 3. Which change? The proposed one, or another option from the valid list. Never anything else.
    const proposed: ChangeOption = { fieldPath: proposal.fieldPath!, proposedValue: proposal.proposedValue! };
    let option = proposed;
    if (input.selectedOptionId !== undefined) {
      const picked = proposal.validOptions.find((o) => o.id === input.selectedOptionId);
      if (!picked?.fieldPath || !picked.proposedValue) {
        throw new AppError("validation_failed", "That option is not one of the valid choices for this proposal.");
      }
      option = { fieldPath: picked.fieldPath, proposedValue: picked.proposedValue };
    }
    const wasEdited = !deepEqual(option, proposed);

    // 4. What the user saw must equal what would be applied.
    const summary = buildApprovalSummary({ failure, diagnosis, config: workflow.config, option });
    if (summaryHash(summary) !== input.summaryHash) throw new AppError("proposal_outdated", OUTDATED);

    const before = readFieldValue(workflow.config, option.fieldPath);
    if (!before) throw new AppError("conflict", "That setting no longer exists, so nothing was applied.");
    const approved = { fieldPath: option.fieldPath, value: option.proposedValue };

    // 5. The approval record comes first: the database refuses a change without one.
    const approvalId = await tx.insertApproval({
      proposalId: proposal.id,
      userId: input.userId,
      decision: "approved",
      approvedFieldPath: approved.fieldPath,
      approvedValue: approved.value,
      wasEdited,
      summaryShown: summary,
      decidedAt: deps.now(),
    });

    // 6. The applier's own re-check (the database trigger checks it again), then the change record.
    const newConfig = applyFieldChange(workflow.config, approved.fieldPath, approved.value);
    const after = readFieldValue(newConfig, approved.fieldPath);
    assertChangeMatchesApproval(approved, { fieldPath: approved.fieldPath, value: after });
    const configChangeId = await tx.insertConfigChange({
      workflowId: workflow.id,
      approvalId,
      fieldPath: approved.fieldPath,
      beforeValue: before,
      afterValue: after,
      appliedAt: deps.now(),
    });

    // 7. The one and only change to the workflow.
    if (!(await tx.updateWorkflowConfig(workflow.id, newConfig, workflow.configVersion))) {
      throw new AppError("proposal_outdated", OUTDATED);
    }

    // 8. Close the proposal and log ids only (never setting values).
    await tx.setProposalStatus(proposal.id, "decided");
    await recordEvent(tx.audit, {
      userId: input.userId,
      runId,
      type: "proposal_decided",
      payload: { proposal_id: proposal.id, decision: "approved", was_edited: wasEdited },
    });
    await recordEvent(tx.audit, {
      userId: input.userId,
      runId,
      type: "change_applied",
      payload: { proposal_id: proposal.id, config_change_id: configChangeId },
    });

    return {
      ok: true,
      result: {
        workflow: { id: workflow.id, configVersion: workflow.configVersion + 1, config: newConfig, lastModifiedBy: "debugger" },
        configChangeId,
        approvalId,
      },
    };
  });

  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}
