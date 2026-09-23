import { AiOutputSchema, type AiOutput } from "@/lib/schemas/ai-output";
import { confidenceRank, type Confidence } from "@/lib/types";

export type ValidationResult = { ok: true; output: AiOutput } | { ok: false; reason: string };

/**
 * TDD section 15, steps 1-2. Off-list picks and over-ceiling confidence are REJECTED,
 * never repaired. The caller retries once, then falls back to manual mode (Decision #031).
 */
export function validateAiOutput(
  raw: unknown,
  candidates: ReadonlyArray<{ id: string }>,
  ceiling: Confidence,
): ValidationResult {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(stripFences(raw));
    } catch {
      return { ok: false, reason: "not valid JSON" };
    }
  }
  const parsed = AiOutputSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: "schema mismatch" };
  const out = parsed.data;

  if (out.selected_candidate_id !== null && !candidates.some((c) => c.id === out.selected_candidate_id)) {
    return { ok: false, reason: "selected fix is not on the valid list" };
  }
  if (confidenceRank(out.confidence) > confidenceRank(ceiling)) {
    return { ok: false, reason: "confidence above the rules' ceiling" };
  }
  if (out.confidence !== "high" && !out.uncertainty_note) {
    return { ok: false, reason: "uncertainty note required when confidence is not high" };
  }
  return { ok: true, output: out };
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
