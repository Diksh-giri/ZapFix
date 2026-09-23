import type { ActionConfig, FieldMapping, TriggerData } from "@/lib/schemas/workflow-config";

/**
 * Turn a saved mapping plus the trigger data into the concrete values an adapter sends.
 * Pure function: easy to test, no I/O.
 *
 * A mapped source that is missing from the trigger data resolves to "" (empty).
 * That empty value is exactly the evidence the "missing required field" rule looks for.
 */
export function resolveConfig(config: ActionConfig, trigger: TriggerData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, mapping] of Object.entries(config)) {
    out[field] = resolveMapping(mapping, trigger);
  }
  return out;
}

export function resolveMapping(mapping: FieldMapping, trigger: TriggerData): string {
  if (mapping.kind === "static") return mapping.value;
  const raw = trigger[mapping.source] ?? "";
  const t = mapping.transform;
  if (!t) return raw;
  switch (t.kind) {
    case "trim":
      return raw.trim();
    case "lowercase":
      return raw.toLowerCase();
    case "date_to_rfc3339":
      // TODO(T10): honor t.timeZone. For now: midnight UTC of the given date.
      return dateToRfc3339(raw, t.fromFormat) ?? raw;
  }
}

export function dateToRfc3339(
  raw: string,
  from: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD",
): string | null {
  const s = raw.trim();
  let y: string;
  let m: string;
  let d: string;
  if (from === "YYYY-MM-DD") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!match) return null;
    y = match[1]!;
    m = match[2]!;
    d = match[3]!;
  } else {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!match) return null;
    y = match[3]!;
    m = from === "MM/DD/YYYY" ? match[1]! : match[2]!;
    d = from === "MM/DD/YYYY" ? match[2]! : match[1]!;
  }
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m}-${d}T00:00:00Z`;
}
