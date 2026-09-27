import { describe, expect, it } from "vitest";
import { TransformSchema } from "@/lib/schemas/workflow-config";
import { dateToRfc3339, resolveConfig } from "@/server/workflows/resolve";

describe("resolveConfig", () => {
  it("resolves mapped, static and transformed fields", () => {
    const out = resolveConfig(
      {
        a: { kind: "mapped", source: "x" },
        b: { kind: "static", value: "fixed" },
        c: { kind: "mapped", source: "d", transform: { kind: "date_to_rfc3339", fromFormat: "MM/DD/YYYY", timeZone: "UTC" } },
        d: { kind: "mapped", source: "missing" },
      },
      { x: "hello", d: "03/15/2026" },
    );
    expect(out).toEqual({ a: "hello", b: "fixed", c: "2026-03-15T00:00:00Z", d: "" });
  });

  it("passes the saved time zone into the date transform", () => {
    const out = resolveConfig(
      {
        start: {
          kind: "mapped",
          source: "date",
          transform: {
            kind: "date_to_rfc3339",
            fromFormat: "MM/DD/YYYY",
            timeZone: "America/New_York",
          },
        },
      },
      { date: "03/15/2026" },
    );

    expect(out.start).toBe("2026-03-15T04:00:00Z");
  });
});

describe("dateToRfc3339", () => {
  it("converts supported formats and rejects invalid ones", () => {
    expect(dateToRfc3339("03/15/2026", "MM/DD/YYYY")).toBe("2026-03-15T00:00:00Z");
    expect(dateToRfc3339("15/03/2026", "DD/MM/YYYY")).toBe("2026-03-15T00:00:00Z");
    expect(dateToRfc3339("2026-03-15", "YYYY-MM-DD")).toBe("2026-03-15T00:00:00Z");
    expect(dateToRfc3339("13/45/2026", "MM/DD/YYYY")).toBeNull();
    expect(dateToRfc3339("02/30/2026", "MM/DD/YYYY")).toBeNull();
    expect(dateToRfc3339("nonsense", "MM/DD/YYYY")).toBeNull();
  });

  it("treats the date as midnight using the zone's offset on that date", () => {
    expect(dateToRfc3339("01/15/2026", "MM/DD/YYYY", "America/New_York"))
      .toBe("2026-01-15T05:00:00Z");
    expect(dateToRfc3339("03/15/2026", "MM/DD/YYYY", "America/New_York"))
      .toBe("2026-03-15T04:00:00Z");
  });

  it("rejects invalid time-zone names in saved transforms and at runtime", () => {
    expect(TransformSchema.safeParse({
      kind: "date_to_rfc3339",
      fromFormat: "MM/DD/YYYY",
      timeZone: "New York",
    }).success).toBe(false);
    expect(dateToRfc3339("03/15/2026", "MM/DD/YYYY", "New York")).toBeNull();
  });
});
