import type { AiOutput } from "@/lib/schemas/ai-output";
import type { StandardError } from "@/lib/schemas/standard-error";
import type { ActionConfig, TriggerData, TriggerSchema } from "@/lib/schemas/workflow-config";
import type { AppId, AttemptStatus, Category, Confidence } from "@/lib/types";
import type { Candidate, Evidence } from "./rules/types";

/** The owned run, failed attempt and workflow facts needed to create a diagnosis. */
export interface DiagnosisContext {
  run: {
    id: string;
    userId: string;
    workflowId: string;
    triggerData: TriggerData;
    repairCount: number;
  };
  attempt: {
    id: string;
    status: AttemptStatus;
    configSnapshot: ActionConfig;
    error: StandardError | null;
  };
  workflow: {
    id: string;
    app: AppId;
    actionKey: string;
    triggerSchema: TriggerSchema;
    currentConfig: ActionConfig;
    configVersion: number;
  };
}

export interface NewDiagnosis {
  attemptId: string;
  category: Category;
  supported: boolean;
  evidence: Evidence[];
  candidates: Candidate[];
  ceiling: Confidence;
  aiStatus: "ok" | "unavailable" | "invalid";
  ai: AiOutput | null;
  confidence: Confidence | null;
  model: string | null;
}

export interface DiagnosisRecord extends NewDiagnosis {
  id: string;
  createdAt: Date;
}

/** Persistence boundary for T13. Every operation includes ownership because the server connection bypasses RLS. */
export interface DiagnosisStore {
  getContext(runId: string, userId: string): Promise<DiagnosisContext | undefined>;
  insert(userId: string, input: NewDiagnosis): Promise<DiagnosisRecord>;
  get(id: string, userId: string): Promise<DiagnosisRecord | undefined>;
}
