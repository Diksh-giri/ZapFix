import { describe, expect, it } from "vitest";
import { sanitizeGoogleBody } from "@/server/adapters/google-calendar/sanitize";

const token = "ya29.secret-access-token";

describe("sanitizeGoogleBody (fixtures must hold no personal data or tokens)", () => {
  it("keeps the error shape and reason codes, which are what the rules need", () => {
    const body = { error: { code: 400, message: "Invalid", errors: [{ domain: "global", reason: "invalid", location: "start.dateTime" }] } };
    expect(sanitizeGoogleBody(body, token)).toEqual(body);
  });

  it("masks quoted values and email addresses anywhere in the text", () => {
    const out = JSON.stringify(
      sanitizeGoogleBody({ error: { message: 'Bad "03/15/2026" for guest@example.com', errors: [{ message: "x tester@gmail.com y" }] } }, token),
    );
    expect(out).not.toContain("03/15/2026");
    expect(out).not.toContain("guest@example.com");
    expect(out).not.toContain("tester@gmail.com");
  });

  it("removes the access token wherever it appears", () => {
    const out = JSON.stringify(sanitizeGoogleBody({ error: { message: `Bearer ${token} bad ${token}` } }, token));
    expect(out).not.toContain("ya29");
  });

  it("drops fields that identify a person or their calendar from a success response", () => {
    const out = sanitizeGoogleBody(
      { id: "abcde", status: "confirmed", htmlLink: "https://cal/x", creator: { email: "me@x.com" }, organizer: { email: "me@x.com" }, attendees: [{ email: "g@x.com" }], summary: "Private meeting", iCalUID: "abc@google.com" },
      token,
    ) as Record<string, unknown>;
    expect(out).toEqual({ id: "abcde", status: "confirmed" });
  });

  it("copes with non-objects", () => {
    expect(sanitizeGoogleBody(undefined, token)).toBeNull();
    expect(sanitizeGoogleBody("plain text guest@example.com", token)).toBe("plain text [email]");
  });
});
