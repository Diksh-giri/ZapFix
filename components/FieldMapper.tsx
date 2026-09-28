"use client";

import type { ActionField } from "@/lib/schemas/workflows";
import type { ActionConfig, FieldMapping, TriggerSchema } from "@/lib/schemas/workflow-config";

const inputClass = "h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm";

export function FieldMapper({
  fields, triggerSchema, value, onChange,
}: {
  fields: ActionField[];
  triggerSchema: TriggerSchema;
  value: ActionConfig;
  onChange: (value: ActionConfig) => void;
}) {
  function set(field: string, mapping: FieldMapping) {
    onChange({ ...value, [field]: mapping });
  }

  return (
    <fieldset className="space-y-4">
      <legend className="text-base font-semibold">Map action fields</legend>
      <p className="text-sm text-neutral-600">Choose form data or a fixed value for each action field.</p>
      {fields.map((field) => {
        const mapping = value[field.key] ?? { kind: "static" as const, value: "" };
        return (
          <div className="rounded-lg border p-4" key={field.key}>
            <label className="text-sm font-medium" htmlFor={`${field.key}-kind`}>
              {field.label}{field.required ? " (required)" : ""}
            </label>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <select
                id={`${field.key}-kind`}
                className={inputClass}
                value={mapping.kind}
                onChange={(event) => set(field.key, event.target.value === "mapped"
                  ? { kind: "mapped", source: triggerSchema.fields[0]?.key ?? "" }
                  : { kind: "static", value: "" })}
              >
                <option value="mapped">Form field</option>
                <option value="static">Fixed value</option>
              </select>
              {mapping.kind === "static" ? (
                <input
                  className={inputClass}
                  aria-label={`${field.label} fixed value`}
                  value={mapping.value}
                  onChange={(event) => set(field.key, { kind: "static", value: event.target.value })}
                />
              ) : (
                <select
                  className={inputClass}
                  aria-label={`${field.label} form field`}
                  value={mapping.source}
                  onChange={(event) => set(field.key, { ...mapping, source: event.target.value })}
                >
                  {triggerSchema.fields.map((triggerField) => (
                    <option key={triggerField.key} value={triggerField.key}>{triggerField.label}</option>
                  ))}
                </select>
              )}
            </div>
            {mapping.kind === "mapped" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-neutral-600" htmlFor={`${field.key}-transform`}>Optional transform</label>
                <select
                  id={`${field.key}-transform`}
                  className={inputClass}
                  value={mapping.transform?.kind ?? "none"}
                  onChange={(event) => {
                    const kind = event.target.value;
                    if (kind === "none") set(field.key, { kind: "mapped", source: mapping.source });
                    if (kind === "trim") set(field.key, { kind: "mapped", source: mapping.source, transform: { kind: "trim" } });
                    if (kind === "lowercase") set(field.key, { kind: "mapped", source: mapping.source, transform: { kind: "lowercase" } });
                    if (kind === "date_to_rfc3339") set(field.key, { kind: "mapped", source: mapping.source, transform: { kind: "date_to_rfc3339", fromFormat: "YYYY-MM-DD", timeZone: "UTC" } });
                  }}
                >
                  <option value="none">None</option>
                  <option value="trim">Trim spaces</option>
                  <option value="lowercase">Lowercase</option>
                  <option value="date_to_rfc3339">Date to RFC 3339</option>
                </select>
              </div>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
