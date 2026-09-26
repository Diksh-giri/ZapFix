import { sha256Hex, stableStringify } from "@/lib/canonical";
import { AppError } from "@/lib/errors";
import { FieldMappingSchema, type ActionConfig, type FieldMapping } from "@/lib/schemas/workflow-config";
import type { Confidence } from "@/lib/types";
import { fieldKeyFromPath, readFieldValue } from "@/server/changes/applier";
import type { ChangeOption, DiagnosisInput, FailureInput } from "./types";

/**
 * The exact text the user sees in the confirm dialog (Section 11 of the TDD, "Approval summary").
 * The server rebuilds this from stored data and compares summaryHash on confirm: if the screen
 * showed something different from what would be applied, the request is refused.
 */
export interface ApprovalSummary {
  failedStep: string;
  originalError: string;
  likelyCause: string;
  evidence: Array<{ label: string; value: string }>;
  fieldPath: string;
  currentValue: unknown;
  proposedValue: unknown;
  expectedEffect: string;
  confidence: Confidence;
  uncertaintyNote: string | null;
}

export function summaryHash(summary: ApprovalSummary): string {
  return sha256Hex(stableStringify(summary));
}

/** Plain-language name for a field mapping, used in the summary and the option picker. */
export function describeMapping(mapping: FieldMapping | null | undefined): string {
  if (!mapping) return "nothing (the setting is empty)";
  if (mapping.kind === "static") return `the fixed text "${mapping.value}"`;
  const base = `trigger field "${mapping.source}"`;
  if (!mapping.transform) return base;
  switch (mapping.transform.kind) {
    case "date_to_rfc3339":
      return `${base}, converted from ${mapping.transform.fromFormat} to a standard date`;
    case "trim":
      return `${base}, with extra spaces removed`;
    case "lowercase":
      return `${base}, in lowercase`;
  }
}

/** System text (not AI text). Says "may fix", never "will fix" (AGENTS.md section 11). */
export function describeEffect(fieldPath: string, current: FieldMapping | null | undefined, proposed: FieldMapping): string {
  const key = fieldKeyFromPath(fieldPath);
  return (
    `Changes the setting "${key}" from ${describeMapping(current)} to ${describeMapping(proposed)}. ` +
    `No other setting changes. This may fix the error; nothing runs again until you retry.`
  );
}

/**
 * Builds the exact summary the user sees, from stored data only. The server calls this again on
 * confirm and compares hashes, so the screen and the applied change cannot drift apart.
 * Throws if there is no valid AI answer or confidence: without them no fix should have been offered.
 */
export function buildApprovalSummary(input: {
  failure: FailureInput;
  diagnosis: DiagnosisInput;
  config: ActionConfig;
  option: ChangeOption;
}): ApprovalSummary {
  const { failure, diagnosis, config, option } = input;
  if (!diagnosis.ai || !diagnosis.confidence) {
    throw new AppError("conflict", "This diagnosis has no valid explanation, so no summary can be shown.");
  }
  const proposed = FieldMappingSchema.safeParse(option.proposedValue);
  if (!proposed.success) throw new AppError("validation_failed", "The new value is not a valid field mapping.");
  const current = readFieldValue(config, option.fieldPath) ?? null; // null (not undefined) so the hash survives storage

  return {
    failedStep: failure.stepKey,
    originalError: failure.originalError,
    likelyCause: diagnosis.ai.likely_cause,
    evidence: diagnosis.evidence,
    fieldPath: option.fieldPath,
    currentValue: current,
    proposedValue: proposed.data,
    expectedEffect: describeEffect(option.fieldPath, current, proposed.data),
    confidence: diagnosis.confidence,
    uncertaintyNote: diagnosis.ai.uncertainty_note ?? null,
  };
}
