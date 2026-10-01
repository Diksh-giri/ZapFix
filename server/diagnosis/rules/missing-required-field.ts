import type { FieldType } from "@/server/adapters/types";
import { maskQuotedValues } from "@/server/diagnosis/ai/payload";
import type { Candidate, Evidence, RuleInput, RuleMatch } from "./types";

/**
 * WORKED EXAMPLE of a rule. Copy this shape for the other two (T13).
 *
 * Detects: the app says a required field is missing AND the configured value is empty --
 * whether that field is mapped to a trigger field that came in blank this run, or is a fixed
 * (static) value that was simply left empty.
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
  if (!actionField || !mapping) return null;
  if (mapping.kind === "mapped" && (resolved[fieldKey] ?? "") !== "") return null; // value is present: not this problem
  if (mapping.kind === "static" && mapping.value !== "") return null; // a non-empty fixed value is not this problem

  const currentSource = mapping.kind === "mapped" ? mapping.source : undefined;
  const wanted = TRIGGER_TYPE_FOR[actionField.type];
  const candidates: Candidate[] = triggerSchema.fields
    .filter(
      (f) =>
        f.key !== currentSource &&
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
    { label: "App error", value: `${error.code}: ${maskQuotedValues(error.message)}` },
    { label: "Failing field", value: actionField.label },
    {
      label: "Currently mapped to",
      value: mapping.kind === "mapped" ? `trigger field "${mapping.source}"` : "a fixed empty value",
    },
    { label: "Value received", value: "empty" },
  ];
  return { category: "missing_required_field", evidence, candidates };
}
