import type { Category, Confidence, ProposalKind } from "@/lib/types";
import type { StandardError } from "@/lib/schemas/standard-error";
import type { ActionConfig, FieldMapping, TriggerData, TriggerSchema } from "@/lib/schemas/workflow-config";
import type { ActionField } from "@/server/adapters/types";

/** Facts the rules found. Shown to the user as "confirmed information", never AI text. */
export interface Evidence {
  label: string;
  value: string;
}

/** A fix the AI is ALLOWED to pick. The AI can never propose anything outside this list. */
export interface Candidate {
  id: string;
  kind: ProposalKind;
  /** e.g. "actionConfig.attendee_email". Absent for reconnect guidance. */
  fieldPath?: string;
  proposedValue?: FieldMapping;
  /** Plain-language label shown in the option picker. */
  description: string;
}

export interface RuleInput {
  error: StandardError;
  config: ActionConfig;
  /** Values after mappings and transforms, as sent to the app. */
  resolved: Record<string, string>;
  triggerSchema: TriggerSchema;
  /** The values the user submitted for this run. Rules use it to avoid proposing an empty field. */
  triggerData: TriggerData;
  actionFields: ActionField[];
}

export interface RuleMatch {
  category: Exclude<Category, "unsupported">;
  evidence: Evidence[];
  candidates: Candidate[];
}

export interface Classification {
  category: Category;
  supported: boolean;
  evidence: Evidence[];
  candidates: Candidate[];
  /** The most confident the AI is allowed to be (Decision #028). */
  ceiling: Confidence;
}
