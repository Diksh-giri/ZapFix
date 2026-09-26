import type { AiOutput } from "@/lib/schemas/ai-output";
import type { ActionConfig, FieldMapping } from "@/lib/schemas/workflow-config";
import type { Category, Confidence, ProposalKind } from "@/lib/types";
import type { Candidate, Evidence } from "@/server/diagnosis/rules/types";

/** A diagnosis as the proposal code needs it (the stored row, with json columns already parsed). */
export interface DiagnosisInput {
  id: string;
  category: Category;
  supported: boolean;
  evidence: Evidence[];
  candidates: Candidate[];
  ceiling: Confidence;
  aiStatus: "ok" | "unavailable" | "invalid";
  ai: AiOutput | null;
  confidence: Confidence | null;
}

/** What failed, taken from the attempt that was diagnosed. The message is already sanitized. */
export interface FailureInput {
  stepKey: string;
  originalError: string;
}

/** One change the user may approve: a single field and its new value. */
export interface ChangeOption {
  fieldPath: string;
  proposedValue: FieldMapping;
}

export type ProposalStatus = "pending" | "decided" | "superseded" | "expired";

/** A proposal before it is saved. `null` values mean "not applicable" (reconnect guidance). */
export interface ProposalDraft {
  diagnosisId: string;
  workflowId: string;
  kind: ProposalKind;
  fieldPath: string | null;
  currentValue: FieldMapping | null;
  proposedValue: FieldMapping | null;
  /** The config-change candidates the user may pick from. Empty for reconnect guidance. */
  validOptions: Candidate[];
  expectedEffect: string;
  baseConfigVersion: number;
}

export interface ProposalRecord extends ProposalDraft {
  id: string;
  status: ProposalStatus;
  createdAt: Date;
}

export interface WorkflowSettings {
  config: ActionConfig;
  configVersion: number;
}
