import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { approvals, configChanges, diagnoses, proposals, runs, stepAttempts, workflows } from "@/db/schema";
import type * as schema from "@/db/schema";
import { AppError } from "@/lib/errors";
import { AiOutputSchema } from "@/lib/schemas/ai-output";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import { ActionConfigSchema, type FieldMapping } from "@/lib/schemas/workflow-config";
import type { Confidence, ProposalKind } from "@/lib/types";
import { createDrizzleAuditStore } from "@/server/audit/drizzle-store";
import type { Candidate, Evidence } from "@/server/diagnosis/rules/types";
import { assertCanDiagnose } from "@/server/runs/engine";
import type { ChangeContext, ProposalContext, ProposalStore, ProposalTx } from "./store";
import type { DiagnosisInput, ProposalDraft, ProposalRecord, ProposalStatus } from "./types";

/**
 * The real database behind ProposalStore. The database is passed in; this file never reads connection strings.
 * It runs on the service connection (bypasses row-level security), so ownership is checked by the services.
 *
 * Every write in decision, confirm and restore goes through `transaction`, which is one database transaction:
 * if anything throws, Postgres rolls all of it back. `load` and `loadChange` lock the rows they read
 * (select ... for update) so two requests cannot both act on the same proposal, change or workflow.
 * Lock order is always proposal or change first, then workflow, so they cannot deadlock each other.
 * The database triggers (db/policies) check the same rules again: a change must match its approval,
 * approvals are append-only, and a saved change may only change status and restored_at.
 */
type Database = PostgresJsDatabase<typeof schema>;
type Executor = Pick<Database, "select" | "insert" | "update">;

const asProposal = (p: typeof proposals.$inferSelect): ProposalRecord => ({
  id: p.id,
  diagnosisId: p.diagnosisId,
  workflowId: p.workflowId,
  kind: p.kind as ProposalKind,
  fieldPath: p.fieldPath,
  currentValue: (p.currentValue as FieldMapping | null) ?? null,
  proposedValue: (p.proposedValue as FieldMapping | null) ?? null,
  validOptions: p.validOptions as Candidate[],
  expectedEffect: p.expectedEffect,
  baseConfigVersion: p.baseConfigVersion,
  status: p.status as ProposalStatus,
  createdAt: p.createdAt,
});

const asDiagnosis = (d: typeof diagnoses.$inferSelect): DiagnosisInput => {
  // An AI answer that no longer validates is treated as absent: no summary can be built from it.
  const ai = d.aiOutput == null ? null : AiOutputSchema.safeParse(d.aiOutput);
  return {
    id: d.id,
    category: d.category as DiagnosisInput["category"],
    supported: d.supported,
    evidence: d.ruleEvidence as Evidence[],
    candidates: d.candidates as Candidate[],
    ceiling: d.confidenceCeiling as Confidence,
    aiStatus: d.aiStatus as DiagnosisInput["aiStatus"],
    ai: ai?.success ? ai.data : null,
    confidence: (d.confidence as Confidence | null) ?? null,
  };
};

function asWorkflow(w: typeof workflows.$inferSelect) {
  const config = ActionConfigSchema.safeParse(w.actionConfig);
  if (!config.success) throw new AppError("internal", "This workflow's settings are not valid.");
  return { id: w.id, userId: w.userId, config: config.data, configVersion: w.configVersion };
}

/** Reads a proposal with its workflow, diagnosis and failed attempt. `lock` adds select ... for update. */
async function readContext(trx: Executor, proposalId: string, lock: boolean): Promise<ProposalContext | undefined> {
  const pq = trx.select().from(proposals).where(eq(proposals.id, proposalId));
  const [p] = lock ? await pq.for("update") : await pq;
  if (!p) return undefined;
  const wq = trx.select().from(workflows).where(eq(workflows.id, p.workflowId));
  const [w] = lock ? await wq.for("update") : await wq;
  const [d] = await trx.select().from(diagnoses).where(eq(diagnoses.id, p.diagnosisId));
  const [a] = d ? await trx.select().from(stepAttempts).where(eq(stepAttempts.id, d.attemptId)) : [];
  if (!w || !d || !a) return undefined;

  const std = StandardErrorSchema.safeParse(a.errorStd);
  return {
    proposal: asProposal(p),
    workflow: asWorkflow(w),
    diagnosis: asDiagnosis(d),
    // errorStd was sanitized before it was stored (masked values, no secrets).
    failure: { stepKey: a.stepKey, originalError: std.success ? `${std.data.code}: ${std.data.message}` : "The app returned an error." },
    runId: a.runId,
  };
}

function makeTx(trx: Executor): ProposalTx {
  return {
    load: (proposalId) => readContext(trx, proposalId, true),

    async loadChange(changeId): Promise<ChangeContext | undefined> {
      const [c] = await trx.select().from(configChanges).where(eq(configChanges.id, changeId)).for("update");
      if (!c) return undefined;
      const [w] = await trx.select().from(workflows).where(eq(workflows.id, c.workflowId)).for("update");
      if (!w) return undefined;

      // The run whose failure led to this change: approval -> proposal -> diagnosis -> attempt.
      const [origin] = await trx
        .select({ runId: stepAttempts.runId })
        .from(approvals)
        .innerJoin(proposals, eq(proposals.id, approvals.proposalId))
        .innerJoin(diagnoses, eq(diagnoses.id, proposals.diagnosisId))
        .innerJoin(stepAttempts, eq(stepAttempts.id, diagnoses.attemptId))
        .where(eq(approvals.id, c.approvalId))
        .limit(1);
      if (!origin) return undefined;

      const [latest] = await trx
        .select({ id: configChanges.id })
        .from(configChanges)
        .where(and(eq(configChanges.workflowId, c.workflowId), eq(configChanges.status, "applied")))
        .orderBy(desc(configChanges.appliedAt), desc(configChanges.id))
        .limit(1);

      return {
        change: {
          id: c.id,
          workflowId: c.workflowId,
          fieldPath: c.fieldPath,
          beforeValue: c.beforeValue,
          afterValue: c.afterValue,
          status: c.status as "applied" | "restored",
          appliedAt: c.appliedAt,
        },
        workflow: asWorkflow(w),
        runId: origin.runId,
        latestAppliedId: latest?.id,
      };
    },

    async insertApproval(a) {
      const [row] = await trx
        .insert(approvals)
        .values({
          proposalId: a.proposalId,
          userId: a.userId,
          decision: a.decision,
          approvedFieldPath: a.approvedFieldPath,
          approvedValue: a.approvedValue,
          wasEdited: a.wasEdited,
          summaryShown: a.summaryShown,
          decidedAt: a.decidedAt,
        })
        .returning({ id: approvals.id });
      if (!row) throw new Error("The approval could not be saved.");
      return row.id;
    },

    async insertConfigChange(c) {
      const [row] = await trx
        .insert(configChanges)
        .values({
          workflowId: c.workflowId,
          approvalId: c.approvalId,
          fieldPath: c.fieldPath,
          beforeValue: c.beforeValue,
          afterValue: c.afterValue,
          appliedAt: c.appliedAt,
        })
        .returning({ id: configChanges.id });
      if (!row) throw new Error("The change could not be saved.");
      return row.id;
    },

    async updateWorkflowConfig(workflowId, config, expectedVersion) {
      const rows = await trx
        .update(workflows)
        .set({
          actionConfig: config,
          configVersion: expectedVersion + 1,
          lastModifiedBy: "debugger",
          updatedAt: new Date(),
        })
        .where(and(eq(workflows.id, workflowId), eq(workflows.configVersion, expectedVersion)))
        .returning({ id: workflows.id });
      return rows.length === 1;
    },

    async setProposalStatus(proposalId, status) {
      await trx.update(proposals).set({ status }).where(eq(proposals.id, proposalId));
    },

    async markChangeRestored(changeId, restoredAt) {
      await trx.update(configChanges).set({ status: "restored", restoredAt }).where(eq(configChanges.id, changeId));
    },

    audit: createDrizzleAuditStore(trx as Database),
  };
}

export function createDrizzleProposalStore(db: Database): ProposalStore {
  return {
    audit: createDrizzleAuditStore(db),
    async getContext(proposalId, userId) {
      const ctx = await readContext(db, proposalId, false); // a plain read: no locks, so showing a proposal never blocks a confirm
      return ctx && ctx.workflow.userId === userId ? ctx : undefined;
    },

    async replacePending(workflowId, diagnosisId, draft: ProposalDraft | null) {
      return db.transaction(async (trx) => {
        const [origin] = await trx
          .select({ runId: runs.id, attemptId: stepAttempts.id, repairCount: runs.repairCount })
          .from(diagnoses)
          .innerJoin(stepAttempts, eq(stepAttempts.id, diagnoses.attemptId))
          .innerJoin(runs, eq(runs.id, stepAttempts.runId))
          .where(
            and(
              eq(diagnoses.id, diagnosisId),
              eq(runs.workflowId, workflowId),
              eq(runs.status, "failed"),
              eq(stepAttempts.status, "failed"),
            ),
          )
          .for("update", { of: runs })
          .limit(1);
        if (!origin) throw new AppError("conflict", "This run changed before its proposal was prepared. Try diagnosis again.");
        assertCanDiagnose(origin.repairCount);

        const [latest] = await trx
          .select({ id: stepAttempts.id })
          .from(stepAttempts)
          .where(eq(stepAttempts.runId, origin.runId))
          .orderBy(desc(stepAttempts.attemptNo))
          .limit(1);
        if (latest?.id !== origin.attemptId) {
          throw new AppError("conflict", "This run changed before its proposal was prepared. Try diagnosis again.");
        }

        await trx
          .update(proposals)
          .set({ status: "superseded" })
          .where(and(eq(proposals.workflowId, workflowId), eq(proposals.status, "pending")));
        if (!draft) return null;
        const [row] = await trx
          .insert(proposals)
          .values({
            diagnosisId: draft.diagnosisId,
            workflowId: draft.workflowId,
            kind: draft.kind,
            fieldPath: draft.fieldPath,
            currentValue: draft.currentValue,
            proposedValue: draft.proposedValue,
            validOptions: draft.validOptions,
            expectedEffect: draft.expectedEffect,
            baseConfigVersion: draft.baseConfigVersion,
          })
          .returning();
        if (!row) throw new Error("The proposal could not be saved.");
        return asProposal(row);
      });
    },

    transaction: (fn) => db.transaction((trx) => fn(makeTx(trx))),
  };
}
