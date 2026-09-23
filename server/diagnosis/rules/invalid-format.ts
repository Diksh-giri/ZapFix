import type { RuleInput, RuleMatch } from "./types";

/**
 * TODO(T13): detect "the app rejected a value's format".
 *  - error.category_hint === "invalid_value" and error.field is set
 *  - compare the value SHAPE (see server/diagnosis/ai/payload.ts shapeOf) with the field's expected type
 *  - candidates: transforms from the closed list in lib/schemas/workflow-config.ts
 *    (for example date_to_rfc3339 with the detected fromFormat)
 *  - build from RECORDED real Calendar errors in tests/fixtures/google-calendar/
 */
export function matchInvalidFormat(_input: RuleInput): RuleMatch | null {
  return null;
}
