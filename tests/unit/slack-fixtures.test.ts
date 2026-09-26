import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSlackAdapter } from "@/server/adapters/slack";

/** Replays the REAL Slack responses recorded by scripts/record-slack-fixtures.ts through the adapter. */
const good = { channel: "C0123456789", text: "Deploy finished" };
const scenarios: Record<string, Record<string, string>> = {
  success: good,
  empty_channel: { ...good, channel: "" },
  unknown_channel: { ...good, channel: "C0000000000" },
  empty_text: { ...good, text: "" },
  invalid_token: good,
};

function load(name: string) {
  return JSON.parse(readFileSync(`tests/fixtures/slack/${name}.json`, "utf8")) as {
    response: { status: number; body: unknown };
    mapped: { ok: boolean; error?: Record<string, unknown> };
  };
}

async function replay(name: string) {
  const f = load(name);
  const fetchFn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(f.response.body), { status: f.response.status, headers: { "content-type": "application/json" } }),
  );
  const r = await createSlackAdapter(fetchFn).execute("post_message", scenarios[name]!, {
    accessToken: "xoxb-replay-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000,
  });
  return { r, f };
}

describe("real Slack responses (recorded fixtures)", () => {
  it("Slack answers an empty channel and an unknown channel with the SAME error; ZapFix tells them apart by whether the value was empty", async () => {
    const empty = await replay("empty_channel");
    const unknown = await replay("unknown_channel");
    expect(empty.f.response.body).toEqual(unknown.f.response.body);
    expect(empty.r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "channel", outcome: "not_executed" } });
    expect(unknown.r).toMatchObject({ ok: false, error: { category_hint: "not_found", field: "channel", outcome: "not_executed" } });
  });

  it("an empty message text is a missing field on 'text'", async () => {
    const { r } = await replay("empty_text");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "text", code: "no_text", outcome: "not_executed" } });
  });

  it("an invalid token is an auth failure, even though Slack answers HTTP 200", async () => {
    const { r, f } = await replay("invalid_token");
    expect(f.response.status).toBe(200);
    expect(r).toMatchObject({ ok: false, error: { category_hint: "auth", code: "invalid_auth", outcome: "not_executed" } });
  });

  it("a real success response is ok", async () => {
    const { r } = await replay("success");
    expect(r).toMatchObject({ ok: true });
  });

  it.each(Object.keys(scenarios))("%s: the saved 'mapped' result matches what the adapter produces today", async (name) => {
    const { r, f } = await replay(name);
    expect(f.mapped.ok).toBe(r.ok);
    if (!r.ok) expect(f.mapped.error).toEqual(r.error);
  });

  it("holds no tokens, personal data or real workspace ids", () => {
    for (const name of Object.keys(scenarios)) {
      const text = readFileSync(`tests/fixtures/slack/${name}.json`, "utf8");
      expect(text).not.toMatch(/xox[a-z]-/); // no Slack tokens
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // no email addresses
      expect(text).not.toMatch(/"channel": "(?!C0000000000")[CGD][A-Z0-9]{8,}"/); // channel ids are placeholders
    }
  });
});
