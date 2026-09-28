"use client";

import type { ActionField } from "@/lib/schemas/workflows";
import type { ActionConfig, FieldMapping, TriggerSchema } from "@/lib/schemas/workflow-config";
import { localDateTimeToRfc3339, rfc3339ToLocalDateTime } from "@/lib/local-datetime";

const inputClass = "h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm";
const TIME_ZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney",
];

function DateTimeStaticInput({
  field, value, timeZone, onChange,
}: {
  field: ActionField;
  value: string;
  timeZone: string;
  onChange: (value: string, timeZone: string) => void;
}) {
  const localValue = rfc3339ToLocalDateTime(value, timeZone);
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <label className="text-sm text-neutral-600">
        {field.label} date and time
        <input
          className={`mt-1 ${inputClass}`}
          type="datetime-local"
          aria-label={`${field.label} date and time`}
          value={localValue}
          onChange={(event) => onChange(localDateTimeToRfc3339(event.target.value, timeZone) ?? "", timeZone)}
        />
      </label>
      <label className="text-sm text-neutral-600">
        Time zone
        <select
          className={`mt-1 ${inputClass}`}
          aria-label={`${field.label} time zone`}
          value={timeZone}
          onChange={(event) => {
            const nextZone = event.target.value;
            const sameWallClockTime = localValue;
            onChange(localDateTimeToRfc3339(sameWallClockTime, nextZone) ?? "", nextZone);
          }}
        >
          {TIME_ZONES.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <p className="text-xs text-neutral-500 sm:col-span-2">ZapFix converts this to the app&apos;s required date format automatically.</p>
    </div>
  );
}

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
      <legend className="text-base font-semibold">Choose what the app should use</legend>
      <p className="text-sm text-neutral-600">
        For each item, choose whether it changes with every run or always stays the same.
      </p>
      {fields.map((field) => {
        const mapping = value[field.key] ?? { kind: "static" as const, value: "" };
        return (
          <div className="rounded-lg border p-4" key={field.key}>
            <label className="text-sm font-medium" htmlFor={`${field.key}-kind`}>
              Where should {field.label.toLowerCase()} come from?{field.required ? " (required)" : ""}
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
                <option value="mapped">Use an answer from the test form</option>
                <option value="static">Use the same value every time</option>
              </select>
              {mapping.kind === "static" && field.type === "datetime_rfc3339" ? (
                <DateTimeStaticInput
                  field={field}
                  value={mapping.value}
                  timeZone={mapping.timeZone ?? "UTC"}
                  onChange={(nextValue, timeZone) => set(field.key, { kind: "static", value: nextValue, timeZone })}
                />
              ) : mapping.kind === "static" ? (
                <input
                  className={inputClass}
                  aria-label={`${field.label} value used every time`}
                  placeholder={`Enter the ${field.label.toLowerCase()} to use every time`}
                  value={mapping.value}
                  onChange={(event) => set(field.key, { kind: "static", value: event.target.value })}
                />
              ) : (
                <select
                  className={inputClass}
                  aria-label={`Choose the test-form answer for ${field.label}`}
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
                <label className="text-sm text-neutral-600" htmlFor={`${field.key}-transform`}>Optional formatting</label>
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
                  <option value="date_to_rfc3339">Convert date for this app</option>
                </select>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-neutral-500">
              {mapping.kind === "mapped"
                ? `${field.label} will use the selected test-form answer each time this workflow runs.`
                : `${field.label} will use this same value every time this workflow runs.`}
            </p>
          </div>
        );
      })}
    </fieldset>
  );
}
