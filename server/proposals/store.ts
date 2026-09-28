import type { ActionConfig } from "@/lib/schemas/workflow-config";
import type { AuditStore } from "@/server/audit/store";
import type { ApprovalSummary } from "./summary";
import type { DiagnosisInput, FailureInput, ProposalDraft, ProposalRecord, ProposalStatus } from "./types";

/** Everything the decision, confirm and restore code needs about one proposal, read inside a transaction. */
export interface ProposalContext {
  proposal: ProposalRecord;
  workflow: { id: string; userId: string; config: ActionConfig; configVersion: number };
  diagnosis: DiagnosisInput;
  failure: FailureInput;
  /** The run whose failure was diagnosed. Events are filed under it. */
  runId: string;
}

/** A saved config change, with what restore needs to decide whether it may be undone. */
export interface ChangeContext {
  change: {
    id: string;
    workflowId: string;
    fieldPath: string;
    beforeValue: unknown;
    afterValue: unknown;
    status: "applied" | "restored";
    appliedAt: Date;
  };
  workflow: { id: string; userId: string; config: ActionConfig; configVersion: number };
  /** The run whose failure led to this change. Events are filed under it. */
  runId: string;
  /** The most recent change of this workflow that is still `applied` (restore goes most-recent-first). */
  latestAppliedId: string | undefined;
}

export interface NewApproval {
  proposalId: string;
  userId: string;
  decision: "approved" | "rejected" | "exited";
  approvedFieldPath: string | null;
  approvedValue: unknown | null;
  wasEdited: boolean;
  summaryShown: ApprovalSummary;
  decidedAt: Date;
}

export interface NewConfigChange {
  workflowId: string;
  approvalId: string;
  fieldPath: string;
  beforeValue: unknown;
  afterValue: unknown;
  appliedAt: Date;
}

/**
 * The writes that must succeed or fail TOGETHER. Everything a service does through a ProposalTx
 * happens in one database transaction: if anything throws, nothing is saved (Appendix E).
 * The real (Drizzle) version locks the proposal and workflow rows in `load` (select ... for update).
 */
export interface ProposalTx {
  load(proposalId: string): Promise<ProposalContext | undefined>;
  /** Reads a change and its workflow, locking both (select ... for update). */
  loadChange(changeId: string): Promise<ChangeContext | undefined>;
  insertApproval(approval: NewApproval): Promise<string>;
  insertConfigChange(change: NewConfigChange): Promise<string>;
  /**
   * Replaces the workflow's settings, adds 1 to config_version and marks it modified by the debugger,
   * but only if config_version still equals `expectedVersion`. Returns false when it does not.
   */
  updateWorkflowConfig(workflowId: string, config: ActionConfig, expectedVersion: number): Promise<boolean>;
  setProposalStatus(proposalId: string, status: ProposalStatus): Promise<void>;
  /** Only status and restored_at may change on a saved change (the database enforces the same). */
  markChangeRestored(changeId: string, restoredAt: Date): Promise<void>;
  audit: AuditStore;
}

/** Persistence port for proposals. drizzle-store.ts is the real one; memory-store.ts is the test double. */
export interface ProposalStore {
  /** A plain read (no locks) of a proposal the user owns, for showing it. Undefined if unknown or not theirs. */
  getContext(proposalId: string, userId: string): Promise<ProposalContext | undefined>;
  /**
   * In ONE step: mark every still-pending proposal of the workflow `superseded`, then save `draft`
   * as the new pending proposal (when there is one). A new diagnosis retires the old proposal even
   * if it offers no fix. Decided proposals are never touched.
   */
  replacePending(workflowId: string, diagnosisId: string, draft: ProposalDraft | null): Promise<ProposalRecord | null>;
  /** Runs `fn` as one all-or-nothing transaction. If `fn` throws, nothing it wrote is kept. */
  transaction<T>(fn: (tx: ProposalTx) => Promise<T>): Promise<T>;
}
