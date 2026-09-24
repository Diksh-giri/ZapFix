import { AppError } from "@/lib/errors";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import type { AttemptRecord, NewAttempt, RunRecord, RunStore, WorkflowRecord } from "./store";

/** TEST DOUBLE for RunStore. Mirrors the DB's one-running / one-succeeded rules. */
export interface MemoryRunStore extends RunStore {
  seedWorkflow(w: Omit<WorkflowRecord, "appId" | "connectionId"> & Partial<Pick<WorkflowRecord, "appId" | "connectionId">>): void;
  setConnectionStatus(workflowId: string, status: string): void;
  updateWorkflowConfig(workflowId: string, config: ActionConfig): void;
  markChangeApplied(runId: string, at: Date): void;
  attempts(runId: string): AttemptRecord[];
  allAttempts(): AttemptRecord[];
  getRunSync(id: string): RunRecord | undefined;
  runCount(): number;
}

export function createMemoryRunStore(): MemoryRunStore {
  const workflows = new Map<string, WorkflowRecord>();
  const runs = new Map<string, RunRecord>();
  const attempts: AttemptRecord[] = [];
  const changes = new Map<string, Date>();
  let seq = 0;

  const forRun = (runId: string) =>
    attempts.filter((a) => a.runId === runId).sort((a, b) => a.attemptNo - b.attemptNo);

  return {
    seedWorkflow(w) {
      workflows.set(w.id, { appId: "google_calendar", connectionId: "conn-1", ...w });
    },
    setConnectionStatus(id, status) {
      const w = workflows.get(id);
      if (w) w.connectionStatus = status;
    },
    updateWorkflowConfig(id, config) {
      const w = workflows.get(id);
      if (w) w.config = config;
    },
    markChangeApplied(runId, at) {
      changes.set(runId, at);
    },
    attempts: (runId) => forRun(runId).map((a) => ({ ...a })),
    allAttempts: () => attempts.map((a) => ({ ...a })),
    getRunSync: (id) => (runs.get(id) ? { ...runs.get(id)! } : undefined),
    runCount: () => runs.size,

    async getWorkflow(id) {
      const w = workflows.get(id);
      return w ? { ...w } : undefined;
    },
    async insertRun(run) {
      const rec: RunRecord = { ...run, id: `run-${++seq}`, status: "running", repairCount: 0 };
      runs.set(rec.id, rec);
      return { ...rec };
    },
    async getRun(id) {
      const r = runs.get(id);
      return r ? { ...r } : undefined;
    },
    async updateRun(id, patch) {
      const r = runs.get(id);
      if (r) Object.assign(r, patch);
    },
    async listAttempts(runId) {
      return forRun(runId).map((a) => ({ ...a }));
    },
    async insertAttempt(a: NewAttempt) {
      const existing = forRun(a.runId).filter((x) => x.stepKey === a.stepKey);
      if (existing.some((x) => x.status === "running")) {
        throw new AppError("attempt_running", "An attempt is already running. Wait for it to finish.");
      }
      if (existing.some((x) => x.status === "succeeded")) {
        throw new AppError("already_succeeded", "This step already succeeded, so it cannot be retried.");
      }
      if (existing.some((x) => x.attemptNo === a.attemptNo)) {
        throw new AppError("conflict", "That attempt number already exists.");
      }
      const rec: AttemptRecord = { ...a, id: `att-${++seq}` };
      attempts.push(rec);
      return { ...rec };
    },
    async updateAttempt(id, patch) {
      const a = attempts.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    },
    async lastChangeAppliedAt(runId) {
      return changes.get(runId);
    },
  };
}
