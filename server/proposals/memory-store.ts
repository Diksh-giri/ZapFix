import type { ProposalStore } from "./store";
import type { ProposalDraft, ProposalRecord, ProposalStatus } from "./types";

/** TEST DOUBLE for ProposalStore. Not used by the app. */
export interface MemoryProposalStore extends ProposalStore {
  all(): ProposalRecord[];
  setStatus(id: string, status: ProposalStatus): void;
}

export function createMemoryProposalStore(): MemoryProposalStore {
  const rows: ProposalRecord[] = [];
  let seq = 0;

  return {
    all: () => rows.map((r) => ({ ...r })),
    setStatus(id, status) {
      const row = rows.find((r) => r.id === id);
      if (row) row.status = status;
    },
    async replacePending(workflowId, draft: ProposalDraft | null) {
      for (const row of rows) {
        if (row.workflowId === workflowId && row.status === "pending") row.status = "superseded";
      }
      if (!draft) return null;
      const record: ProposalRecord = { ...draft, id: `proposal-${++seq}`, status: "pending", createdAt: new Date() };
      rows.push(record);
      return { ...record };
    },
  };
}
