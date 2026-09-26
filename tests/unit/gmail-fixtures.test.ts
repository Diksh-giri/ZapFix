import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createGmailAdapter } from "@/server/adapters/gmail";

/** Replays the REAL Gmail responses recorded by scripts/record-gmail-fixtures.ts through the adapter. */
const good = { to: "guest@example.com", subject: "Weekly update", body: "All green." };
const scenarios: Record<string, Record<string, string>> = {
  success: good,
  empty_to: { ...good, to: "" },
  invalid_to: { ...good, to: "not-an-email" },
  empty_subject: { ...good, subject: "" },
  invalid_token: good,
};

function load(name: string) {
  return JSON.parse(readFileSync(`tests/fixtures/gmail/${name}.json`, "utf8")) as {
    response: { status: number; body: unknown };
    mapped: { ok: boolean; error?: Record<string, unknown> };
  };
}

async function replay(name: string) {
  const f = load(name);
  const fetchFn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(f.response.body), { status: f.response.status, headers: { "content-type": "application/json" } }),
  );
  const r = await createGmailAdapter(fetchFn).execute("send_email", scenarios[name]!, {
    accessToken: "ya29.replay-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000,
  });
  return { r, f };
}

describe("real Gmail responses (recorded fixtures)", () => {
  it("an empty recipient is a MISSING field on 'to', which is what the missing-field rule needs", async () => {
    const { r } = await replay("empty_to");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "to", outcome: "not_executed", retryable: false } });
  });

  it("a recipient that is not an address is an invalid value on 'to'", async () => {
    const { r } = await replay("invalid_to");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "invalid_value", field: "to", outcome: "not_executed" } });
  });

  it("an invalid token is an auth failure that was not executed", async () => {
    const { r } = await replay("invalid_token");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "auth", code: "authError", outcome: "not_executed" } });
  });

  it("Gmail itself accepts an empty subject (recorded HTTP 200, a real email was sent); that is why the adapter refuses it before the call", async () => {
    expect(load("empty_subject").response.status).toBe(200);
    const { r } = await replay("empty_subject");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "subject", outcome: "not_executed" } });
  });

  it("a real success response is ok", async () => {
    const { r } = await replay("success");
    expect(r).toMatchObject({ ok: true });
  });

  // empty_subject is left out: the recording shows what Gmail does (sends it), but the adapter now refuses it first.
  it.each(Object.keys(scenarios).filter((n) => n !== "empty_subject"))("%s: the saved 'mapped' result matches what the adapter produces today", async (name) => {
    const { r, f } = await replay(name);
    expect(f.mapped.ok).toBe(r.ok);
    if (!r.ok) expect(f.mapped.error).toEqual(r.error);
  });

  it("holds no personal data, tokens or real message ids", () => {
    for (const name of Object.keys(scenarios)) {
      const text = readFileSync(`tests/fixtures/gmail/${name}.json`, "utf8");
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // no email addresses
      expect(text).not.toMatch(/ya29\.|Bearer\s+\w/); // no tokens
      expect(text).not.toMatch(/"(id|threadId)": "(?!\[id\])/); // ids are masked
    }
  });
});
