import { describe, expect, it } from "vitest";
import { buildAiPayload, maskQuotedValues, shapeOf } from "@/server/diagnosis/ai/payload";

describe("shapeOf", () => {
  it.each([
    ["", "empty"],
    ["  ", "empty"],
    ["ana@example.com", "email-like"],
    ["03/15/2026", "date MM/DD/YYYY"],
    ["2026-03-15", "date YYYY-MM-DD"],
    ["2026-03-15T09:00:00Z", "datetime RFC 3339"],
    ["42", "number"],
    ["Quarterly review", "text"],
  ])("%j -> %s", (input, shape) => {
    expect(shapeOf(input)).toBe(shape);
  });
});

describe("maskQuotedValues (TDD section 28 item 6)", () => {
  it("masks values that an app error echoes back", () => {
    expect(maskQuotedValues('Invalid value "03/15/2026" for start')).toBe('Invalid value "[value]" for start');
    expect(maskQuotedValues("Bad address ana@example.com")).toBe("Bad address [email]");
  });
});

describe("buildAiPayload (Decision #018, safety test 8)", () => {
  it("contains names and shapes, never raw values", () => {
    const payload = buildAiPayload({
      category: "invalid_format",
      error: { category_hint: "invalid_value", code: "invalid_datetime", message: 'Bad value "03/15/2026"', field: "start", retryable: false, outcome: "not_executed" },
      config: {
        title: { kind: "static", value: "Secret client meeting" },
        start: { kind: "mapped", source: "meeting_date" },
        attendee_email: { kind: "mapped", source: "contact_email" },
      },
      resolved: { title: "Secret client meeting", start: "03/15/2026", attendee_email: "ana@example.com" },
      candidates: [],
    });
    const text = JSON.stringify(payload);
    expect(text).not.toContain("Secret client meeting");
    expect(text).not.toContain("ana@example.com");
    expect(text).not.toContain("03/15/2026");
    expect(payload.fields.find((f) => f.key === "start")?.valueShape).toBe("date MM/DD/YYYY");
  });
});
