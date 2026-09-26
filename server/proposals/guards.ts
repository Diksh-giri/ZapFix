import { AppError } from "@/lib/errors";
import type { ProposalContext, ProposalTx } from "./store";

/**
 * The checks every decision and confirm starts with. Runs inside the transaction, on rows the
 * store has locked, so two requests cannot both pass it for the same proposal.
 *   - unknown proposal, or someone else's: not_found (never reveals that it exists)
 *   - already decided: conflict; replaced or expired: proposal_outdated
 *   - reconnect guidance has no approval flow: validation_failed
 */
export async function loadPendingProposal(tx: ProposalTx, proposalId: string, userId: string): Promise<ProposalContext> {
  const ctx = await tx.load(proposalId);
  if (!ctx || ctx.workflow.userId !== userId) throw new AppError("not_found", "That proposal was not found.");

  const { status, kind } = ctx.proposal;
  if (status === "decided") throw new AppError("conflict", "This proposal has already been decided.");
  if (status === "superseded" || status === "expired") {
    throw new AppError("proposal_outdated", "This proposal is out of date. Request a new diagnosis.");
  }
  if (kind !== "config_change" || !ctx.proposal.fieldPath || !ctx.proposal.proposedValue) {
    throw new AppError("validation_failed", "This suggestion has no change to approve. Use the Reconnect button instead.");
  }
  return ctx;
}
