import type { Transform } from "@/lib/schemas/workflow-config";
import { shapeOf, type ValueShape } from "@/server/diagnosis/ai/payload";
import type { Candidate, Evidence, RuleInput, RuleMatch } from "./types";

/**
 * Detects "the app rejected a value's format".
 *  - error.category_hint === "invalid_value" and error.field is set
 *  - compare the value SHAPE (see server/diagnosis/ai/payload.ts shapeOf) with the field's expected type
 *  - candidates: transforms from the closed list in lib/schemas/workflow-config.ts
 *    (for example date_to_rfc3339 with the detected fromFormat)
 *  - build from RECORDED real Calendar errors in tests/fixtures/google-calendar/
 */
const DATE_FORMATS_FOR: Partial<Record<ValueShape, Array<Extract<Transform, { kind: "date_to_rfc3339" }>["fromFormat"]>>> = {
  "date MM/DD/YYYY": ["MM/DD/YYYY", "DD/MM/YYYY"],
  "date YYYY-MM-DD": ["YYYY-MM-DD"],
};

export function matchInvalidFormat(input: RuleInput): RuleMatch | null {
  const { error, config, resolved, actionFields } = input;
  if (error.category_hint !== "invalid_value" || !error.field) return null;

  const fieldKey = error.field;
  const actionField = actionFields.find((field) => field.key === fieldKey);
  const mapping = config[fieldKey];
  if (!actionField || !mapping) return null;

  const valueShape = shapeOf(resolved[fieldKey] ?? "");
  const formats = actionField.type === "datetime_rfc3339" ? (DATE_FORMATS_FOR[valueShape] ?? []) : [];
  const candidates: Candidate[] =
    mapping.kind === "mapped" && valueShape !== "empty"
      ? formats.map((fromFormat) => ({
          id: `transform:${fieldKey}:${fromFormat}`,
          kind: "config_change" as const,
          fieldPath: `actionConfig.${fieldKey}`,
          proposedValue: {
            kind: "mapped" as const,
            source: mapping.source,
            transform: { kind: "date_to_rfc3339" as const, fromFormat, timeZone: "UTC" },
          },
          description: `Convert ${actionField.label} from ${fromFormat} to RFC 3339`,
        }))
      : [];

  const evidence: Evidence[] = [
    { label: "App error", value: `${error.code}: ${error.message}` },
    { label: "Failing field", value: actionField.label },
    { label: "Value format", value: valueShape },
    { label: "Expected format", value: actionField.type },
  ];

  return { category: "invalid_format", evidence, candidates };
}
