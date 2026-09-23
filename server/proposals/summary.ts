import { sha256Hex, stableStringify } from "@/lib/canonical";
import type { Confidence } from "@/lib/types";

/**
 * The exact text the user sees in the confirm dialog (Section 11 of the TDD, "Approval summary").
 * The server rebuilds this from stored data and compares summaryHash on confirm: if the screen
 * showed something different from what would be applied, the request is refused.
 */
export interface ApprovalSummary {
  failedStep: string;
  originalError: string;
  likelyCause: string;
  evidence: Array<{ label: string; value: string }>;
  fieldPath: string;
  currentValue: unknown;
  proposedValue: unknown;
  expectedEffect: string;
  confidence: Confidence;
  uncertaintyNote: string | null;
}

export function summaryHash(summary: ApprovalSummary): string {
  return sha256Hex(stableStringify(summary));
}

// TODO(T14): buildApprovalSummary(proposal, diagnosis, selectedOption); createProposal(); recordDecision().
