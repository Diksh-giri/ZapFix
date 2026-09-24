import { describe, expect, it } from "vitest";
import { sanitizeSlackBody } from "@/server/adapters/slack/sanitize";

const token = "xoxb-secret-bot-token";

describe("sanitizeSlackBody (fixtures must hold no personal data or tokens)", () => {
  it("keeps what the rules need from an error", () => {
    expect(sanitizeSlackBody({ ok: false, error: "missing_scope", needed: "chat:write", provided: "identify" }, token)).toEqual({
      ok: false, error: "missing_scope", needed: "chat:write", provided: "identify",
    });
  });

  it("drops the message, user, team and bot ids from a success response", () => {
    const out = sanitizeSlackBody(
      { ok: true, channel: "C0123", ts: "1.2", message: { text: "Private text", user: "U1", team: "T1", bot_id: "B1", blocks: [] }, warning: "x" },
      token,
    );
    expect(out).toEqual({ ok: true, channel: "C0123", ts: "1.2", warning: "x" });
  });

  it("removes the token and masks quoted values and emails in any text", () => {
    const out = JSON.stringify(sanitizeSlackBody({ ok: false, error: `bad ${token} "secret value" a@b.com` }, token));
    expect(out).not.toContain("xoxb");
    expect(out).not.toContain("secret value");
    expect(out).not.toContain("a@b.com");
  });

  it("copes with non-objects", () => {
    expect(sanitizeSlackBody(undefined, token)).toBeNull();
    expect(sanitizeSlackBody("nope", token)).toBeNull();
  });
});
