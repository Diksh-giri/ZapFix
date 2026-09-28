import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { diagnoses, runs, stepAttempts, workflows } from "@/db/schema";
import type * as schema from "@/db/schema";
import { AppError } from "@/lib/errors";
import { AiOutputSchema } from "@/lib/schemas/ai-output";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import { ActionConfigSchema, TriggerDataSchema, TriggerSchemaSchema } from "@/lib/schemas/workflow-config";
import type { AppId, AttemptStatus, Confidence } from "@/lib/types";
import type { Candidate, Evidence } from "./rules/types";
import type { DiagnosisContext, DiagnosisRecord, DiagnosisStore } from "./store";

type Database = PostgresJsDatabase<typeof schema>;

function asDiagnosis(row: typeof diagnoses.$inferSelect): DiagnosisRecord {
  const ai = row.aiOutput === null ? null : AiOutputSchema.safeParse(row.aiOutput);
  if (ai && !ai.success) throw new AppError("internal", "This diagnosis is not valid.");
  return {
    id: row.id,
    attemptId: row.attemptId,
    category: row.category as DiagnosisRecord["category"],
    supported: row.supported,
    evidence: row.ruleEvidence as Evidence[],
    candidates: row.candidates as Candidate[],
    ceiling: row.confidenceCeiling as Confidence,
    aiStatus: row.aiStatus as DiagnosisRecord["aiStatus"],
    ai: ai?.data ?? null,
    confidence: (row.confidence as Confidence | null) ?? null,
    model: row.model,
    createdAt: row.createdAt,
  };
}

function asContext(row: {
  run: typeof runs.$inferSelect;
  attempt: typeof stepAttempts.$inferSelect;
  workflow: typeof workflows.$inferSelect;
}): DiagnosisContext {
  const triggerData = TriggerDataSchema.safeParse(row.run.triggerData);
  const configSnapshot = ActionConfigSchema.safeParse(row.attempt.configSnapshot);
  const error = row.attempt.errorStd === null ? null : StandardErrorSchema.safeParse(row.attempt.errorStd);
  const triggerSchema = TriggerSchemaSchema.safeParse(row.workflow.triggerSchema);
  const currentConfig = ActionConfigSchema.safeParse(row.workflow.actionConfig);
  if (!triggerData.success || !configSnapshot.success || (error && !error.success) || !triggerSchema.success || !currentConfig.success) {
    throw new AppError("internal", "This failed run cannot be diagnosed because its saved data is not valid.");
  }
  return {
    run: {
      id: row.run.id,
      userId: row.run.userId,
      workflowId: row.run.workflowId,
      triggerData: triggerData.data,
      repairCount: row.run.repairCount,
    },
    attempt: {
      id: row.attempt.id,
      status: row.attempt.status as AttemptStatus,
      configSnapshot: configSnapshot.data,
      error: error?.data ?? null,
    },
    workflow: {
      id: row.workflow.id,
      app: row.workflow.app as AppId,
      actionKey: row.workflow.actionKey,
      triggerSchema: triggerSchema.data,
      currentConfig: currentConfig.data,
      configVersion: row.workflow.configVersion,
    },
  };
}

export function createDrizzleDiagnosisStore(db: Database): DiagnosisStore {
  return {
    async getContext(runId, userId) {
      const [row] = await db
        .select({ run: runs, attempt: stepAttempts, workflow: workflows })
        .from(runs)
        .innerJoin(stepAttempts, eq(stepAttempts.runId, runs.id))
        .innerJoin(workflows, eq(workflows.id, runs.workflowId))
        .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
        .orderBy(desc(stepAttempts.attemptNo))
        .limit(1);
      return row ? asContext(row) : undefined;
    },

    async insert(input) {
      const [row] = await db
        .insert(diagnoses)
        .values({
          attemptId: input.attemptId,
          category: input.category,
          supported: input.supported,
          ruleEvidence: input.evidence,
          candidates: input.candidates,
          confidenceCeiling: input.ceiling,
          aiStatus: input.aiStatus,
          aiOutput: input.ai,
          confidence: input.confidence,
          model: input.model,
        })
        .returning();
      if (!row) throw new Error("The diagnosis could not be saved.");
      return asDiagnosis(row);
    },

    async get(id, userId) {
      const [row] = await db
        .select({ diagnosis: diagnoses })
        .from(diagnoses)
        .innerJoin(stepAttempts, eq(stepAttempts.id, diagnoses.attemptId))
        .innerJoin(runs, eq(runs.id, stepAttempts.runId))
        .where(and(eq(diagnoses.id, id), eq(runs.userId, userId)))
        .limit(1);
      return row ? asDiagnosis(row.diagnosis) : undefined;
    },
  };
}
