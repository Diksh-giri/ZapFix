import type { FieldType } from "@/server/adapters/types";
import type { Candidate, Evidence, RuleInput, RuleMatch } from "./types";

/**
 * WORKED EXAMPLE of a rule. Copy this shape for the other two (T13).
 *
 * Detects: the app says a required field is missing AND the mapped trigger value is empty.
 * Candidates: other trigger fields of a compatible type THAT HAVE A VALUE in this run,
 * mapped to the same action field. (Proposing another empty field would not fix anything.)
 */
const TRIGGER_TYPE_FOR: Record<FieldType, string | null> = {
  email: "email",
  text: "text",
  datetime_rfc3339: "date",
  text_list: null,
};

export function matchMissingRequiredField(input: RuleInput): RuleMatch | null {
  const { error, config, resolved, triggerSchema, triggerData, actionFields } = input;
  if (error.category_hint !== "missing_field" || !error.field) return null;

  const fieldKey = error.field;
  const actionField = actionFields.find((f) => f.key === fieldKey);
  const mapping = config[fieldKey];
  if (!actionField || !mapping || mapping.kind !== "mapped") return null;
  if ((resolved[fieldKey] ?? "") !== "") return null; // value is present: not this problem

  const wanted = TRIGGER_TYPE_FOR[actionField.type];
  const candidates: Candidate[] = triggerSchema.fields
    .filter(
      (f) =>
        f.key !== mapping.source &&
        wanted !== null &&
        f.type === wanted &&
        (triggerData[f.key] ?? "").trim() !== "",
    )
    .map((f) => ({
      id: `map:${fieldKey}:${f.key}`,
      kind: "config_change" as const,
      fieldPath: `actionConfig.${fieldKey}`,
      proposedValue: { kind: "mapped" as const, source: f.key },
      description: `Use "${f.label}" for ${actionField.label}`,
    }));

  const evidence: Evidence[] = [
    { label: "App error", value: `${error.code}: ${error.message}` },
    { label: "Failing field", value: actionField.label },
    { label: "Currently mapped to", value: `trigger field "${mapping.source}"` },
    { label: "Value received", value: "empty" },
  ];
  return { category: "missing_required_field", evidence, candidates };
}
