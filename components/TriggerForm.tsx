"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TriggerData, TriggerSchema } from "@/lib/schemas/workflow-config";

export function TriggerForm({
  triggerSchema, busy = false, onRun,
}: {
  triggerSchema: TriggerSchema;
  busy?: boolean;
  onRun: (data: TriggerData) => Promise<void>;
}) {
  const [values, setValues] = useState<TriggerData>({});
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void onRun(values); }}>
      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-base font-semibold">Test data</legend>
        {triggerSchema.fields.map((field) => (
          <label className="block text-sm font-medium" key={field.key}>
            {field.label}
            <input
              required
              className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-3 text-sm"
              type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            />
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={busy}>{busy ? "Running..." : "Run test"}</Button>
    </form>
  );
}
