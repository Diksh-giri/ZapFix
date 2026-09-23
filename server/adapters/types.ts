import type { AppId, Provider } from "@/lib/types";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import type { StandardError } from "@/lib/schemas/standard-error";

/**
 * The contract every app adapter implements (TDD section 12).
 * Adding an app = adding a folder under server/adapters/ that implements AppAdapter
 * and registering it in registry.ts. Nothing else in the codebase should change.
 */

export type FieldType = "text" | "email" | "datetime_rfc3339" | "text_list";

export interface ActionField {
  key: string;
  label: string;
  required: boolean;
  type: FieldType;
}

export interface ActionDef {
  key: string;
  label: string;
  fields: ActionField[];
}

export interface ExecuteContext {
  /** Decrypted server-side just before the call. Never log it, never send it anywhere else. */
  accessToken: string;
  /** run_id:step:attempt_no. Use as a client-supplied id where the app supports it. */
  idempotencyKey: string;
  timeoutMs: number;
}

export type ExecuteResult =
  | { ok: true; externalRef: string; requestSummary: Record<string, string> }
  | { ok: false; error: StandardError; requestSummary: Record<string, string> };

export interface AppAdapter {
  id: AppId;
  provider: Provider;
  actions: ActionDef[];

  /** Problems with a saved mapping (for example a required field with no mapping). Empty = valid. */
  validateConfig(actionKey: string, config: ActionConfig): string[];

  /**
   * Make the real call. Values are already resolved (mappings and transforms applied).
   * MUST enforce ctx.timeoutMs. MUST return a StandardError, never throw raw app errors.
   * A timeout or dropped connection is outcome "uncertain".
   */
  execute(
    actionKey: string,
    values: Record<string, string>,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult>;
}

/** Shared helper: required fields that have no mapping at all. */
export function missingRequiredMappings(action: ActionDef, config: ActionConfig): string[] {
  return action.fields
    .filter((f) => f.required && !config[f.key])
    .map((f) => `"${f.label}" is required but not mapped`);
}
