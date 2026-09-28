import { describe, expect, it } from "vitest";
import { localDateTimeToRfc3339, rfc3339ToLocalDateTime } from "@/lib/local-datetime";
import { FieldMappingSchema } from "@/lib/schemas/workflow-config";

describe("local date and time conversion", () => {
  it("converts the same wall-clock choice using the selected time zone", () => {
    expect(localDateTimeToRfc3339("2026-10-01T14:30", "UTC")).toBe("2026-10-01T14:30:00Z");
    expect(localDateTimeToRfc3339("2026-10-01T14:30", "America/New_York")).toBe("2026-10-01T18:30:00Z");
    expect(localDateTimeToRfc3339("2026-01-15T14:30", "America/New_York")).toBe("2026-01-15T19:30:00Z");
  });

  it("round-trips a stored instant for display in the selected zone", () => {
    const stored = localDateTimeToRfc3339("2026-10-01T14:30", "America/New_York");
    expect(stored).not.toBeNull();
    expect(rfc3339ToLocalDateTime(stored!, "America/New_York")).toBe("2026-10-01T14:30");
  });

  it("rejects impossible dates, daylight-saving gaps, and invalid zones", () => {
    expect(localDateTimeToRfc3339("2026-02-30T12:00", "UTC")).toBeNull();
    expect(localDateTimeToRfc3339("2026-03-08T02:30", "America/New_York")).toBeNull();
    expect(localDateTimeToRfc3339("2026-10-01T14:30", "New York")).toBeNull();
  });

  it("validates the saved time zone on static mappings", () => {
    expect(FieldMappingSchema.safeParse({
      kind: "static", value: "2026-10-01T18:30:00Z", timeZone: "America/New_York",
    }).success).toBe(true);
    expect(FieldMappingSchema.safeParse({
      kind: "static", value: "2026-10-01T18:30:00Z", timeZone: "New York",
    }).success).toBe(false);
  });
});
