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
      return dateToRfc3339(raw, t.fromFormat, t.timeZone) ?? raw;
  }
}

function utcMillis(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function localParts(formatter: Intl.DateTimeFormat, instant: number) {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function dateToRfc3339(
  raw: string,
  from: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD",
  timeZone = "UTC",
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
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const calendarCheck = new Date(utcMillis(year, month, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) return null;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return null;
  }

  const desiredLocalAsUtc = utcMillis(year, month, day);
  let instant = desiredLocalAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = localParts(formatter, instant);
    const representedLocalAsUtc = utcMillis(represented.year, represented.month, represented.day)
      + represented.hour * 3_600_000
      + represented.minute * 60_000
      + represented.second * 1_000;
    const adjustment = desiredLocalAsUtc - representedLocalAsUtc;
    instant += adjustment;
    if (adjustment === 0) break;
  }

  const resolved = localParts(formatter, instant);
  if (
    resolved.year !== year ||
    resolved.month !== month ||
    resolved.day !== day ||
    resolved.hour !== 0 ||
    resolved.minute !== 0 ||
    resolved.second !== 0
  ) return null;

  return new Date(instant).toISOString().replace(".000Z", "Z");
}
