import type { ActionConfig, FieldMapping } from "@/lib/schemas/workflow-config";
import { FieldMappingSchema } from "@/lib/schemas/workflow-config";
import { deepEqual } from "@/lib/canonical";
import { AppError } from "@/lib/errors";

/**
 * Change Applier and Restore (module 9, task T14).
 * The pure parts below are DONE and tested. The transaction (approval + config change +
 * workflow update + events, all or nothing) is TODO.
 *
 * Only paths of the form "actionConfig.<fieldKey>" can be changed in the MVP.
 */

const PREFIX = "actionConfig.";

export function fieldKeyFromPath(fieldPath: string): string {
  if (!fieldPath.startsWith(PREFIX) || fieldPath.length === PREFIX.length) {
    throw new AppError("validation_failed", `Unsupported field path "${fieldPath}".`);
  }
  return fieldPath.slice(PREFIX.length);
}

export function readFieldValue(config: ActionConfig, fieldPath: string): FieldMapping | undefined {
  return config[fieldKeyFromPath(fieldPath)];
}

/** Returns a NEW config with exactly one field replaced. Never mutates. */
export function applyFieldChange(config: ActionConfig, fieldPath: string, value: unknown): ActionConfig {
  const key = fieldKeyFromPath(fieldPath);
  const parsed = FieldMappingSchema.safeParse(value);
  if (!parsed.success) throw new AppError("validation_failed", "The new value is not a valid field mapping.");
  return { ...config, [key]: parsed.data };
}

/** The Applier's own re-check, before the DB trigger runs the same check again. */
export function assertChangeMatchesApproval(
  approved: { fieldPath: string; value: unknown },
  change: { fieldPath: string; value: unknown },
): void {
  if (approved.fieldPath !== change.fieldPath || !deepEqual(approved.value, change.value)) {
    throw new AppError("conflict", "The change does not match what was approved. Nothing was applied.");
  }
}

/** Restore safety (Decision #011): true if someone edited the field after the debugger changed it. */
export function hasManualEditConflict(currentValue: unknown, valueAppliedByDebugger: unknown): boolean {
  return !deepEqual(currentValue, valueAppliedByDebugger);
}
