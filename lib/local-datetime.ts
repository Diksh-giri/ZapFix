const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function utcMillis(year: number, month: number, day: number, hour: number, minute: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  return date.getTime();
}

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-US", {
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
}

function parts(formatter: Intl.DateTimeFormat, instant: number) {
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

/** Converts a human-selected wall-clock time in an IANA zone into the stored RFC 3339 instant. */
export function localDateTimeToRfc3339(local: string, timeZone: string): string | null {
  const match = LOCAL_DATE_TIME.exec(local);
  const formatter = formatterFor(timeZone);
  if (!match || !formatter) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const desired = utcMillis(year, month, day, hour, minute);
  const calendarCheck = new Date(desired);
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) return null;

  let instant = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = parts(formatter, instant);
    const representedAsUtc = utcMillis(
      represented.year, represented.month, represented.day, represented.hour, represented.minute,
    ) + represented.second * 1_000;
    const adjustment = desired - representedAsUtc;
    instant += adjustment;
    if (adjustment === 0) break;
  }

  const resolved = parts(formatter, instant);
  if (
    resolved.year !== year || resolved.month !== month || resolved.day !== day ||
    resolved.hour !== hour || resolved.minute !== minute || resolved.second !== 0
  ) return null;
  return new Date(instant).toISOString().replace(".000Z", "Z");
}

/** Formats a stored RFC 3339 instant for a datetime-local input in the chosen zone. */
export function rfc3339ToLocalDateTime(value: string, timeZone: string): string {
  const instant = Date.parse(value);
  const formatter = formatterFor(timeZone);
  if (!Number.isFinite(instant) || !formatter) return "";
  const local = parts(formatter, instant);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(local.year).padStart(4, "0")}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}`;
}
