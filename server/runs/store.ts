import type { AppId, AttemptStatus } from "@/lib/types";
import type { ActionConfig, TriggerData } from "@/lib/schemas/workflow-config";

export type RunStatus = AttemptStatus;

export interface WorkflowRecord {
  id: string;
  userId: string;
  appId: AppId;
  actionKey: string;
  config: ActionConfig;
  triggerFields: string[];
  connectionStatus: "active" | "needs_reconnect" | string;
}

export interface RunRecord {
  id: string;
  workflowId: string;
  userId: string;
  triggerData: TriggerData;
  status: RunStatus;
  repairCount: number;
  startedAt: Date;
  finishedAt?: Date;
}

export interface AttemptRecord {
  id: string;
  runId: string;
  stepKey: string;
  attemptNo: number;
  status: AttemptStatus;
  configSnapshot: ActionConfig;
  requestSummary?: Record<string, string>;
  errorRaw?: Record<string, unknown>;
  errorStd?: Record<string, unknown>;
  idempotencyKey: string;
  requestKey?: string;
  externalRef?: string;
  startedAt: Date;
  finishedAt?: Date;
}

export type NewAttempt = Omit<AttemptRecord, "id">;

/**
 * Persistence port for the run engine. insertAttempt MUST be atomic and reject a second
 * running or second succeeded attempt (throw AppError attempt_running / already_succeeded);
 * the real store gets that from the DB's partial unique indexes.
 */
export interface RunStore {
  getWorkflow(id: string): Promise<WorkflowRecord | undefined>;
  insertRun(run: Omit<RunRecord, "id" | "status" | "repairCount">): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | undefined>;
  updateRun(id: string, patch: Partial<RunRecord>): Promise<void>;
  listAttempts(runId: string): Promise<AttemptRecord[]>;
  insertAttempt(attempt: NewAttempt): Promise<AttemptRecord>;
  updateAttempt(id: string, patch: Partial<AttemptRecord>): Promise<void>;
  findAttemptByRequestKey(runId: string, requestKey: string): Promise<AttemptRecord | undefined>;
  lastChangeAppliedAt(runId: string): Promise<Date | undefined>;
}
