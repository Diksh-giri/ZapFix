import { deepEqual } from "@/lib/canonical";
import type { ProposalContext } from "./store";
import { buildApprovalSummary, summaryHash, type ApprovalSummary } from "./summary";
import type { ProposalKind } from "@/lib/types";
import type { ProposalStatus } from "./types";

export interface ProposalOptionView {
  id: string;
  description: string;
  fieldPath: string;
  isDefault: boolean;
  /** Exactly what the confirm dialog shows for this option. */
  summary: ApprovalSummary;
  /** Send this back on confirm. Built here, from the same code confirm uses, never in the browser. */
  summaryHash: string;
}

export interface ProposalView {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  baseConfigVersion: number;
  expectedEffect: string;
  options: ProposalOptionView[];
}

/**
 * What the screen needs to show a proposal: every valid option with its summary and hash.
 * Uses the same builders as confirm, so the hash the screen sends always matches the server's rebuild
 * (as long as the settings have not changed, which confirm also checks).
 */
export function buildProposalView(ctx: ProposalContext): ProposalView {
  const { proposal, workflow, diagnosis, failure } = ctx;
  const options: ProposalOptionView[] =
    proposal.kind !== "config_change"
      ? []
      : proposal.validOptions.flatMap((o) => {
          if (!o.fieldPath || !o.proposedValue) return [];
          const summary = buildApprovalSummary({
            failure,
            diagnosis,
            config: workflow.config,
            option: { fieldPath: o.fieldPath, proposedValue: o.proposedValue },
          });
          return [
            {
              id: o.id,
              description: o.description,
              fieldPath: o.fieldPath,
              isDefault: o.fieldPath === proposal.fieldPath && deepEqual(o.proposedValue, proposal.proposedValue),
              summary,
              summaryHash: summaryHash(summary),
            },
          ];
        });

  return {
    id: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    baseConfigVersion: proposal.baseConfigVersion,
    expectedEffect: proposal.expectedEffect,
    options,
  };
}
