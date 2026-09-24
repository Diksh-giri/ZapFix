import { describe, expect, it, vi } from "vitest";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import { createSlackAdapter } from "@/server/adapters/slack";

const values = { channel: "C0123456789", text: "Deploy finished" };
const ctx = { accessToken: "xoxb-secret-bot-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000 };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const slackError = (error: string) => json({ ok: false, error });

async function run(fetchFn: typeof fetch, v: Record<string, string> = values, c = ctx) {
  return createSlackAdapter(fetchFn).execute("post_message", v, c);
}

describe("post_message: the request", () => {
  it("posts JSON to chat.postMessage with the bot token as a bearer header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ ok: true, channel: "C0123456789", ts: "1503435956.000247" }));
    await run(fetchFn);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer xoxb-secret-bot-token");
    expect(headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(String(init.body))).toEqual({ channel: "C0123456789", text: "Deploy finished" });
  });

  it("sends empty values to Slack as they are, so Slack's real errors are what we record", async () => {
    const fetchFn = vi.fn().mockResolvedValue(slackError("channel_not_found"));
    await run(fetchFn, { channel: "", text: "" });
    expect(JSON.parse(String((fetchFn.mock.calls[0]![1] as RequestInit).body))).toEqual({ channel: "", text: "" });
  });
});

describe("post_message: success", () => {
  it("returns channel id plus message timestamp, and a summary with shapes only", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({ ok: true, channel: "C0123456789", ts: "1503435956.000247", message: { text: "Deploy finished" } })));
    expect(r).toEqual({
      ok: true,
      externalRef: "C0123456789:1503435956.000247",
      requestSummary: { channel: "provided", text: "provided" },
    });
    expect(JSON.stringify(r)).not.toContain("Deploy finished");
  });

  it("marks empty values as empty in the summary", async () => {
    const r = await run(vi.fn().mockResolvedValue(slackError("no_text")), { channel: "C1", text: "" });
    expect(r.requestSummary).toEqual({ channel: "provided", text: "empty" });
  });

  it("does not claim success when Slack says ok but returns no timestamp", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({ ok: true })));
    expect(r).toMatchObject({ ok: false, error: { outcome: "uncertain" } });
  });
});

describe("post_message: Slack errors (HTTP 200 with ok:false) become StandardErrors", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["invalid_auth", { category_hint: "auth", outcome: "not_executed", retryable: false }],
    ["not_authed", { category_hint: "auth" }],
    ["token_revoked", { category_hint: "auth" }],
    ["token_expired", { category_hint: "auth" }],
    ["account_inactive", { category_hint: "auth" }],
    ["missing_scope", { category_hint: "auth" }],
    ["channel_not_found", { category_hint: "not_found", field: "channel", outcome: "not_executed" }],
    ["is_archived", { category_hint: "not_found", field: "channel" }],
    ["not_in_channel", { category_hint: "not_found", field: "channel" }],
    ["msg_too_long", { category_hint: "invalid_value", field: "text" }],
    ["ratelimited", { category_hint: "rate_limit", retryable: true, outcome: "not_executed" }],
    ["rate_limited", { category_hint: "rate_limit", retryable: true }],
    ["internal_error", { category_hint: "unavailable", retryable: true, outcome: "uncertain" }],
    ["fatal_error", { category_hint: "unavailable", outcome: "uncertain" }],
    ["service_unavailable", { category_hint: "unavailable", outcome: "uncertain" }],
    ["request_timeout", { category_hint: "unavailable", outcome: "uncertain" }],
    ["something_new", { category_hint: "unknown", outcome: "not_executed" }],
  ];

  it.each(cases)("%s", async (code, expected) => {
    const r = await run(vi.fn().mockResolvedValue(slackError(code)));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatchObject(expected);
      expect(StandardErrorSchema.safeParse(r.error).success).toBe(true);
    }
  });

  it("uses Slack's error code as the code and a plain sentence as the message", async () => {
    const r = await run(vi.fn().mockResolvedValue(slackError("channel_not_found")));
    expect(r).toMatchObject({ ok: false, error: { code: "channel_not_found" } });
    expect(!r.ok && r.error.message).toMatch(/channel/i);
  });

  it("no_text is a missing text field", async () => {
    const r = await run(vi.fn().mockResolvedValue(slackError("no_text")), { channel: "C1", text: "" });
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "text" } });
  });

  it("a channel Slack cannot find, sent empty, is a missing channel", async () => {
    const r = await run(vi.fn().mockResolvedValue(slackError("channel_not_found")), { channel: "", text: "hi" });
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "channel" } });
  });

  it("invalid_arguments with an empty required value is missing, otherwise invalid", async () => {
    const empty = await run(vi.fn().mockResolvedValue(slackError("invalid_arguments")), { channel: "", text: "hi" });
    expect(empty).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "channel" } });
    const other = await run(vi.fn().mockResolvedValue(slackError("invalid_arguments")));
    expect(other).toMatchObject({ ok: false, error: { category_hint: "invalid_value" } });
  });

  it("never lets an odd error code carry text into the result", async () => {
    const r = await run(vi.fn().mockResolvedValue(slackError('bad "Deploy finished" for guest@example.com')));
    const text = JSON.stringify(r);
    expect(text).not.toContain("Deploy finished");
    expect(text).not.toContain("guest@example.com");
    expect(r).toMatchObject({ ok: false, error: { code: "unknown_error" } });
  });
});

describe("post_message: HTTP level", () => {
  it("429 is a rate limit that was not executed", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({ ok: false, error: "ratelimited" }, 429, { "retry-after": "30" })));
    expect(r).toMatchObject({ ok: false, error: { category_hint: "rate_limit", retryable: true, outcome: "not_executed" } });
  });

  it("5xx is unavailable and uncertain, even with an HTML body", async () => {
    const r = await run(vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));
    expect(r).toMatchObject({ ok: false, error: { category_hint: "unavailable", code: "http_502", outcome: "uncertain" } });
  });

  it("a timeout is uncertain, because Slack may have posted the message", async () => {
    const hang = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
    );
    const r = await run(hang as unknown as typeof fetch, values, { ...ctx, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, error: { code: "timeout", outcome: "uncertain", retryable: true } });
  });

  it("a dropped connection is uncertain too", async () => {
    const r = await run(vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(r).toMatchObject({ ok: false, error: { code: "network_error", outcome: "uncertain" } });
  });
});

describe("the adapter contract", () => {
  it("never puts the bot token in a result", async () => {
    for (const res of [slackError("invalid_auth"), json({ ok: true, channel: "C1", ts: "1.2" }), new Response("xoxb-secret-bot-token", { status: 500 })]) {
      expect(JSON.stringify(await run(vi.fn().mockResolvedValue(res)))).not.toContain("xoxb-secret-bot-token");
    }
  });

  it("rejects an unknown action without calling Slack", async () => {
    const fetchFn = vi.fn();
    const r = await createSlackAdapter(fetchFn).execute("delete_message", values, ctx);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, error: { code: "unknown_action", outcome: "not_executed" } });
  });

  it("is the Slack adapter", () => {
    const a = createSlackAdapter(vi.fn());
    expect([a.id, a.provider, a.actions.map((x) => x.key)]).toEqual(["slack", "slack", ["post_message"]]);
  });
});
