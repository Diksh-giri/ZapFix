import { and, asc, eq, max } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { approvals, configChanges, connections, diagnoses, proposals, runs, stepAttempts, workflows } from "@/db/schema";
import type * as schema from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { AppId } from "@/lib/types";
import { ActionConfigSchema, TriggerSchemaSchema } from "@/lib/schemas/workflow-config";
import type { AttemptRecord, RunRecord, RunStatus, RunStore } from "./store";

/**
 * The real database behind RunStore. The database is passed in; this file never reads connection strings.
 * It runs on the service connection (bypasses row-level security), so ownership is checked by the engine.
 * The one-running and one-success rules are enforced by the database's partial unique indexes: a second
 * insert fails with a unique violation, which is turned into a plain error here.
 */
type Database = PostgresJsDatabase<typeof schema>;

const asRun = (r: typeof runs.$inferSelect): RunRecord => ({
  id: r.id,
  workflowId: r.workflowId,
  userId: r.userId,
  triggerData: r.triggerData as RunRecord["triggerData"],
  status: r.status as RunStatus,
  repairCount: r.repairCount,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt ?? undefined,
});

const asAttempt = (a: typeof stepAttempts.$inferSelect): AttemptRecord => ({
  id: a.id,
  runId: a.runId,
  stepKey: a.stepKey,
  attemptNo: a.attemptNo,
  status: a.status as AttemptRecord["status"],
  configSnapshot: a.configSnapshot as AttemptRecord["configSnapshot"],
  requestSummary: (a.requestSummary as AttemptRecord["requestSummary"]) ?? undefined,
  errorRaw: (a.errorRaw as AttemptRecord["errorRaw"]) ?? undefined,
  errorStd: (a.errorStd as AttemptRecord["errorStd"]) ?? undefined,
  idempotencyKey: a.idempotencyKey,
  externalRef: a.externalRef ?? undefined,
  startedAt: a.startedAt,
  finishedAt: a.finishedAt ?? undefined,
});

/** drizzle may wrap the driver error in `cause`; postgres.js puts the details on the error itself. */
function pgError(err: unknown): { code?: string; constraint_name?: string } {
  const e = err as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  return e.cause?.code ? e.cause : e;
}

export function createDrizzleRunStore(db: Database): RunStore {
  return {
    async getWorkflow(id) {
      const [row] = await db
        .select({ w: workflows, connectionStatus: connections.status })
        .from(workflows)
        .leftJoin(connections, eq(connections.id, workflows.connectionId))
        .where(eq(workflows.id, id))
        .limit(1);
      if (!row) return undefined;
      const config = ActionConfigSchema.safeParse(row.w.actionConfig);
      const trigger = TriggerSchemaSchema.safeParse(row.w.triggerSchema);
      if (!config.success || !trigger.success) throw new AppError("internal", "This workflow's settings are not valid.");
      return {
        id: row.w.id,
        userId: row.w.userId,
        appId: row.w.app as AppId,
        connectionId: row.w.connectionId,
        actionKey: row.w.actionKey,
        config: config.data,
        triggerFields: trigger.data.fields.map((f) => f.key),
        connectionStatus: row.connectionStatus ?? "none",
      };
    },

    async insertRun(run) {
      const [row] = await db
        .insert(runs)
        .values({ workflowId: run.workflowId, userId: run.userId, triggerData: run.triggerData, startedAt: run.startedAt })
        .returning();
      if (!row) throw new Error("The run could not be saved.");
      return asRun(row);
    },

    async getRun(id) {
      const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
      return row ? asRun(row) : undefined;
    },

    async updateRun(id, patch) {
      const set: Partial<typeof runs.$inferInsert> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.repairCount !== undefined) set.repairCount = patch.repairCount;
      if ("finishedAt" in patch) set.finishedAt = patch.finishedAt ?? null;
      if (Object.keys(set).length > 0) await db.update(runs).set(set).where(eq(runs.id, id));
    },

    async listAttempts(runId) {
      const rows = await db.select().from(stepAttempts).where(eq(stepAttempts.runId, runId)).orderBy(asc(stepAttempts.attemptNo));
      return rows.map(asAttempt);
    },

    async insertAttempt(a) {
      try {
        const [row] = await db
          .insert(stepAttempts)
          .values({
            runId: a.runId,
            stepKey: a.stepKey,
            attemptNo: a.attemptNo,
            status: a.status,
            configSnapshot: a.configSnapshot,
            idempotencyKey: a.idempotencyKey,
            startedAt: a.startedAt,
          })
          .returning();
        if (!row) throw new Error("The attempt could not be saved.");
        return asAttempt(row);
      } catch (err) {
        const { code, constraint_name: constraint } = pgError(err);
        if (code === "23505") {
          if (constraint === "step_attempts_one_running_uq") {
            throw new AppError("attempt_running", "An attempt is already running. Wait for it to finish.");
          }
          if (constraint === "step_attempts_one_success_uq") {
            throw new AppError("already_succeeded", "This step already succeeded, so it cannot be retried.");
          }
          throw new AppError("conflict", "That attempt already exists. Refresh and try again.");
        }
        throw err;
      }
    },

    async updateAttempt(id, patch) {
      const set: Partial<typeof stepAttempts.$inferInsert> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if ("requestSummary" in patch) set.requestSummary = patch.requestSummary ?? null;
      if ("errorRaw" in patch) set.errorRaw = patch.errorRaw ?? null;
      if ("errorStd" in patch) set.errorStd = patch.errorStd ?? null;
      if ("externalRef" in patch) set.externalRef = patch.externalRef ?? null;
      if ("finishedAt" in patch) set.finishedAt = patch.finishedAt ?? null;
      if (Object.keys(set).length > 0) await db.update(stepAttempts).set(set).where(eq(stepAttempts.id, id));
    },

    async lastChangeAppliedAt(runId) {
      const [row] = await db
        .select({ at: max(configChanges.appliedAt) })
        .from(configChanges)
        .innerJoin(approvals, eq(approvals.id, configChanges.approvalId))
        .innerJoin(proposals, eq(proposals.id, approvals.proposalId))
        .innerJoin(diagnoses, eq(diagnoses.id, proposals.diagnosisId))
        .innerJoin(stepAttempts, eq(stepAttempts.id, diagnoses.attemptId))
        .where(and(eq(stepAttempts.runId, runId)));
      return row?.at ?? undefined;
    },
  };
}
