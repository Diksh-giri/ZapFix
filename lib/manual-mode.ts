import type { DiagnosisView } from "@/lib/schemas/diagnosis";
import type { Category } from "@/lib/types";

export type ManualModeReason =
  | "unsupported"
  | "low_confidence"
  | "no_candidates"
  | "ai_unavailable"
  | "ai_invalid"
  | "repair_limit_reached";

export function manualModeReason(
  diagnosis: DiagnosisView | null,
  repairLimitReached = false,
): ManualModeReason | null {
  if (repairLimitReached) return "repair_limit_reached";
  if (!diagnosis) return null;
  if (!diagnosis.supported || diagnosis.category === "unsupported") return "unsupported";
  if (diagnosis.aiStatus === "unavailable") return "ai_unavailable";
  if (diagnosis.aiStatus === "invalid") return "ai_invalid";
  if (diagnosis.confidence === "low") return "low_confidence";
  if (diagnosis.candidates.length === 0) return "no_candidates";
  return null;
}

const TIPS: Record<Category, string> = {
  missing_required_field: "Check that the form field feeding this setting is filled in, or map a different field.",
  invalid_format: "Check the format the app expects and convert the value before sending it.",
  expired_connection: "Reconnect the app from the Connections page.",
  unsupported: "The original error is shown above. Check the app's status page, or edit the workflow manually.",
};

function findEvidence(evidence: DiagnosisView["evidence"] | undefined, label: string): string | undefined {
  return evidence?.find((item) => item.label === label)?.value;
}

/**
 * Falls back to the fixed per-category tip when the rule's evidence doesn't name a field
 * (expired_connection, unsupported) or evidence isn't available (e.g. repair_limit_reached).
 */
export function manualModeTip(category: Category | undefined, evidence?: DiagnosisView["evidence"]): string {
  const resolvedCategory = category ?? "unsupported";
  const field = findEvidence(evidence, "Failing field");
  if (field && resolvedCategory === "missing_required_field") {
    return `The action field "${field}" needs a value. Go to the workflow editor, make sure the trigger form sends one, and map it here, or map a different field that already has a value.`;
  }
  if (field && resolvedCategory === "invalid_format") {
    const expected = findEvidence(evidence, "Expected format");
    return `The action field "${field}" received a value in a format the app rejected${expected ? ` (expected: ${expected})` : ""}. Go to the workflow editor and fix the value or its mapping before running again.`;
  }
  return TIPS[resolvedCategory];
}

export function canRetryDiagnosis(reason: ManualModeReason): boolean {
  return reason === "ai_unavailable" || reason === "ai_invalid";
}
