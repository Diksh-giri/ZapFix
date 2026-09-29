import { deepEqual } from "@/lib/canonical";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import type { StoredEvent } from "@/server/audit/store";
import type { ChangeContext, NewApproval, NewConfigChange, ProposalContext, ProposalStore, ProposalTx } from "./store";
import type { ProposalDraft, ProposalRecord, ProposalStatus } from "./types";

/** Where a test can force a failure, to prove a half-finished transaction leaves nothing behind. */
export type FailurePoint =
  | "load"
  | "insertApproval"
  | "insertConfigChange"
  | "updateWorkflowConfig"
  | "setProposalStatus"
  | "markChangeRestored"
  | "insertEvent";

export interface StoredApproval extends NewApproval {
  id: string;
}
export interface StoredConfigChange extends NewConfigChange {
  id: string;
  status: "applied" | "restored";
  restoredAt?: Date;
}
export interface StoredWorkflow {
  id: string;
  userId: string;
  config: ActionConfig;
  configVersion: number;
  lastModifiedBy: "user" | "debugger";
}

/** TEST DOUBLE for ProposalStore. Mirrors the database rules that matter here. Not used by the app. */
export interface MemoryProposalStore extends ProposalStore {
  all(): ProposalRecord[];
  setStatus(id: string, status: ProposalStatus): void;
  /** Adds a proposal with its diagnosis and failure, and the workflow too if it is not there yet. */
  seed(context: ProposalContext): void;
  workflow(id: string): StoredWorkflow | undefined;
  /** Simulates the user editing the workflow by hand: new settings, config_version + 1. */
  editByHand(workflowId: string, config: ActionConfig): void;
  approvals(): StoredApproval[];
  changes(): StoredConfigChange[];
  events(): StoredEvent[];
  failAt(point: FailurePoint | null): void;
}

interface State {
  proposals: ProposalRecord[];
  contexts: Map<string, Omit<ProposalContext, "proposal" | "workflow">>;
  workflows: Map<string, StoredWorkflow>;
  approvals: StoredApproval[];
  changes: StoredConfigChange[];
  events: StoredEvent[];
}

export function createMemoryProposalStore(): MemoryProposalStore {
  let state: State = { proposals: [], contexts: new Map(), workflows: new Map(), approvals: [], changes: [], events: [] };
  let seq = 0;
  let failing: FailurePoint | null = null;
  const maybeFail = (point: FailurePoint) => {
    if (failing === point) throw new Error(`Simulated failure at ${point}`);
  };

  const clone = (s: State): State => structuredClone(s);

  const durableAudit: ProposalStore["audit"] = {
    async insertEvent(e) {
      maybeFail("insertEvent");
      state.events.push(structuredClone(e));
    },
    async hasEvent(userId, runId, type) {
      return state.events.some((e) => e.userId === userId && e.runId === runId && e.type === type);
    },
    async incrementRateLimit() {
      return 1;
    },
    async runOwnedBy() {
      return true;
    },
  };

  function makeTx(s: State): ProposalTx {
    return {
      async load(proposalId) {
        maybeFail("load");
        const proposal = s.proposals.find((p) => p.id === proposalId);
        const extra = s.contexts.get(proposalId);
        const workflow = proposal ? s.workflows.get(proposal.workflowId) : undefined;
        if (!proposal || !extra || !workflow) return undefined;
        return {
          proposal: structuredClone(proposal),
          workflow: { id: workflow.id, userId: workflow.userId, config: structuredClone(workflow.config), configVersion: workflow.configVersion },
          ...structuredClone(extra),
        };
      },
      async loadChange(changeId) {
        const change = s.changes.find((c) => c.id === changeId);
        const workflow = change ? s.workflows.get(change.workflowId) : undefined;
        if (!change || !workflow) return undefined;
        const proposalId = s.approvals.find((a) => a.id === change.approvalId)?.proposalId;
        const runId = proposalId ? s.contexts.get(proposalId)?.runId : undefined;
        if (!runId) return undefined;
        const applied = s.changes.filter((c) => c.workflowId === change.workflowId && c.status === "applied");
        const result: ChangeContext = {
          change: {
            id: change.id,
            workflowId: change.workflowId,
            fieldPath: change.fieldPath,
            beforeValue: structuredClone(change.beforeValue),
            afterValue: structuredClone(change.afterValue),
            status: change.status,
            appliedAt: change.appliedAt,
          },
          workflow: { id: workflow.id, userId: workflow.userId, config: structuredClone(workflow.config), configVersion: workflow.configVersion },
          runId,
          latestAppliedId: applied.at(-1)?.id, // insertion order stands in for applied_at order
        };
        return result;
      },
      async insertApproval(a) {
        maybeFail("insertApproval");
        if (s.approvals.some((x) => x.proposalId === a.proposalId)) throw new Error("approvals: one decision per proposal");
        const id = `approval-${++seq}`;
        s.approvals.push({ ...structuredClone(a), id });
        return id;
      },
      async insertConfigChange(c) {
        maybeFail("insertConfigChange");
        // The database trigger: a change must equal the approval that authorizes it.
        const approval = s.approvals.find((a) => a.id === c.approvalId);
        if (!approval || approval.decision !== "approved") throw new Error("config change requires an approved approval");
        if (approval.approvedFieldPath !== c.fieldPath || !deepEqual(approval.approvedValue, c.afterValue)) {
          throw new Error("config change does not match the approved field and value");
        }
        if (s.changes.some((x) => x.approvalId === c.approvalId)) throw new Error("config_changes: one change per approval");
        const id = `change-${++seq}`;
        s.changes.push({ ...structuredClone(c), id, status: "applied" });
        return id;
      },
      async updateWorkflowConfig(workflowId, config, expectedVersion) {
        maybeFail("updateWorkflowConfig");
        const w = s.workflows.get(workflowId);
        if (!w || w.configVersion !== expectedVersion) return false;
        w.config = structuredClone(config);
        w.configVersion += 1;
        w.lastModifiedBy = "debugger";
        return true;
      },
      async setProposalStatus(proposalId, status) {
        maybeFail("setProposalStatus");
        const p = s.proposals.find((x) => x.id === proposalId);
        if (p) p.status = status;
      },
      async markChangeRestored(changeId, restoredAt) {
        maybeFail("markChangeRestored");
        const c = s.changes.find((x) => x.id === changeId);
        if (c) {
          c.status = "restored";
          c.restoredAt = restoredAt;
        }
      },
      audit: {
        async insertEvent(e) {
          maybeFail("insertEvent");
          s.events.push(structuredClone(e));
        },
        async hasEvent(userId, runId, type) {
          return s.events.some((e) => e.userId === userId && e.runId === runId && e.type === type);
        },
        async incrementRateLimit() {
          return 1;
        },
        async runOwnedBy() {
          return true;
        },
      },
    };
  }

  return {
    audit: durableAudit,
    all: () => state.proposals.map((r) => ({ ...r })),
    setStatus(id, status) {
      const row = state.proposals.find((r) => r.id === id);
      if (row) row.status = status;
    },
    seed(context) {
      state.proposals.push(structuredClone(context.proposal));
      state.contexts.set(context.proposal.id, { diagnosis: structuredClone(context.diagnosis), failure: { ...context.failure }, runId: context.runId });
      if (!state.workflows.has(context.workflow.id)) {
        state.workflows.set(context.workflow.id, { ...structuredClone(context.workflow), lastModifiedBy: "user" });
      }
    },
    workflow: (id) => {
      const w = state.workflows.get(id);
      return w ? structuredClone(w) : undefined;
    },
    editByHand(workflowId, config) {
      const w = state.workflows.get(workflowId);
      if (!w) return;
      w.config = structuredClone(config);
      w.configVersion += 1;
      w.lastModifiedBy = "user";
    },
    approvals: () => structuredClone(state.approvals),
    changes: () => structuredClone(state.changes),
    events: () => structuredClone(state.events),
    failAt(point) {
      failing = point;
    },

    async getContext(proposalId, userId) {
      const ctx = await makeTx(clone(state)).load(proposalId);
      return ctx && ctx.workflow.userId === userId ? ctx : undefined;
    },

    async replacePending(workflowId, _diagnosisId, draft: ProposalDraft | null) {
      for (const row of state.proposals) {
        if (row.workflowId === workflowId && row.status === "pending") row.status = "superseded";
      }
      if (!draft) return null;
      const record: ProposalRecord = { ...draft, id: `proposal-${++seq}`, status: "pending", createdAt: new Date() };
      state.proposals.push(record);
      return { ...record };
    },

    async transaction(fn) {
      const working = clone(state);
      const result = await fn(makeTx(working));
      state = working; // commit: only reached when fn did not throw
      return result;
    },
  };
}
