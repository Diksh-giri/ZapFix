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

export function manualModeTip(category: Category | undefined): string {
  return TIPS[category ?? "unsupported"];
}

export function canRetryDiagnosis(reason: ManualModeReason): boolean {
  return reason === "ai_unavailable" || reason === "ai_invalid";
}
