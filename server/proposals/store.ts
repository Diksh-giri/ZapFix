import type { ProposalDraft, ProposalRecord } from "./types";

/**
 * Persistence port for proposals. memory-store.ts is the test double.
 * TODO(T14): decision (reject/exit), confirm transaction, restore, and the Drizzle version of this store.
 */
export interface ProposalStore {
  /**
   * In ONE step: mark every still-pending proposal of the workflow `superseded`, then save `draft`
   * as the new pending proposal (when there is one). A new diagnosis retires the old proposal even
   * if it offers no fix. Decided proposals are never touched.
   */
  replacePending(workflowId: string, draft: ProposalDraft | null): Promise<ProposalRecord | null>;
}
