"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TriggerData, TriggerSchema } from "@/lib/schemas/workflow-config";

export function TriggerForm({
  triggerSchema, busy = false, disabled = false, onRun,
}: {
  triggerSchema: TriggerSchema;
  busy?: boolean;
  disabled?: boolean;
  onRun: (data: TriggerData) => Promise<void>;
}) {
  const [values, setValues] = useState<TriggerData>({});
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void onRun(values); }}>
      <fieldset className="space-y-3" disabled={busy || disabled}>
        <legend className="text-base font-semibold">Test data</legend>
        {triggerSchema.fields.map((field) => (
          <label className="block text-sm font-medium" key={field.key}>
            {field.label}
            {field.type === "text_list" ? (
              <textarea
                required
                className="mt-1 min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                placeholder="Enter one cell value per line"
                value={values[field.key] ?? ""}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              />
            ) : (
              <input
                required
                className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-3 text-sm"
                type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
                value={values[field.key] ?? ""}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              />
            )}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={busy || disabled}>{busy ? "Running..." : "Run test"}</Button>
    </form>
  );
}
