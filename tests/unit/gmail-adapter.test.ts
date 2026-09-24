import { describe, expect, it, vi } from "vitest";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import { createGmailAdapter } from "@/server/adapters/gmail";

const values = { to: "guest@example.com", subject: "Weekly update", body: "All green.\nSee you Monday." };
const ctx = { accessToken: "ya29.secret-access-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000 };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const googleError = (status: number, reason: string, message = "Something", location?: string) =>
  json({ error: { code: status, message, errors: [{ domain: "global", reason, message, ...(location ? { location } : {}) }] } }, status);

async function run(fetchFn: typeof fetch, v: Record<string, string> = values, c = ctx) {
  return createGmailAdapter(fetchFn).execute("send_email", v, c);
}
const decodeRaw = (fetchFn: ReturnType<typeof vi.fn>) =>
  Buffer.from(JSON.parse(String((fetchFn.mock.calls[0]![1] as RequestInit).body)).raw as string, "base64url").toString("utf8");

describe("send_email: the request", () => {
  it("posts one RFC 2822 message to messages.send for the signed-in user, with the token", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: "18abc", threadId: "t1" }));
    await run(fetchFn);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ya29.secret-access-token");
    const raw = decodeRaw(fetchFn);
    expect(raw).toContain("To: guest@example.com\r\n");
    expect(raw).toContain("Subject: Weekly update\r\n");
    expect(raw).toContain("MIME-Version: 1.0\r\n");
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"\r\n');
    expect(raw).toContain("Content-Transfer-Encoding: base64\r\n\r\n");
  });

  it("puts the body after a blank line, base64 encoded, and it round-trips including non-ASCII text", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: "1" }));
    await run(fetchFn, { ...values, body: "Héllo wörld ✓\nline two" });
    const raw = decodeRaw(fetchFn);
    const encodedBody = raw.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(encodedBody, "base64").toString("utf8")).toBe("Héllo wörld ✓\nline two");
  });

  it("encodes a non-ASCII subject as an RFC 2047 encoded word", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: "1" }));
    await run(fetchFn, { ...values, subject: "Réunion ✓" });
    const header = decodeRaw(fetchFn).split("\r\n").find((l) => l.startsWith("Subject: "))!;
    const word = /=\?UTF-8\?B\?(.+)\?=/.exec(header)![1]!;
    expect(Buffer.from(word, "base64").toString("utf8")).toBe("Réunion ✓");
  });

  it("sends an empty recipient to Gmail as it is, so Gmail's real error is what we record", async () => {
    const fetchFn = vi.fn().mockResolvedValue(googleError(400, "invalidArgument", "Invalid To header"));
    await run(fetchFn, { ...values, to: "" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(decodeRaw(fetchFn)).toContain("To: \r\n");
  });
});

describe("send_email: header injection", () => {
  it.each([
    ["to", "guest@example.com\r\nBcc: victim@example.com"],
    ["to", "guest@example.com\nBcc: victim@example.com"],
    ["subject", "Hello\r\nBcc: victim@example.com"],
    ["subject", "Hello\rBcc: victim@example.com"],
  ])("refuses a %s value with a line break, without calling Gmail", async (field, value) => {
    const fetchFn = vi.fn();
    const r = await run(fetchFn, { ...values, [field]: value });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, error: { category_hint: "invalid_value", code: "invalid_header_value", field, outcome: "not_executed", retryable: false } });
    expect(JSON.stringify(r)).not.toContain("victim@example.com");
  });
});

describe("send_email: success", () => {
  it("returns the message id and a summary with shapes only, never the raw values", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({ id: "18abc", threadId: "t1", labelIds: ["SENT"] })));
    expect(r).toEqual({ ok: true, externalRef: "18abc", requestSummary: { to: "provided", subject: "provided", body: "provided" } });
    expect(JSON.stringify(r)).not.toContain("guest@example.com");
    expect(JSON.stringify(r)).not.toContain("Weekly update");
  });

  it("marks empty values as empty", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({ id: "1" })), { ...values, to: "" });
    expect(r.requestSummary.to).toBe("empty");
  });

  it("does not claim success when Gmail answers 200 without an id", async () => {
    expect(await run(vi.fn().mockResolvedValue(json({})))).toMatchObject({ ok: false, error: { outcome: "uncertain" } });
  });
});

describe("send_email: failures become StandardErrors", () => {
  const cases: Array<[string, Response, Record<string, unknown>]> = [
    ["401", googleError(401, "authError", "Invalid Credentials"), { category_hint: "auth", outcome: "not_executed" }],
    ["403 insufficient permissions", googleError(403, "insufficientPermissions"), { category_hint: "auth" }],
    ["403 daily limit", googleError(403, "dailyLimitExceeded"), { category_hint: "rate_limit", retryable: true }],
    ["403 user rate limit", googleError(403, "userRateLimitExceeded"), { category_hint: "rate_limit" }],
    ["429", googleError(429, "rateLimitExceeded"), { category_hint: "rate_limit", retryable: true, outcome: "not_executed" }],
    ["404", googleError(404, "notFound"), { category_hint: "not_found" }],
    ["500", googleError(500, "backendError"), { category_hint: "unavailable", outcome: "uncertain", retryable: true }],
    ["503", googleError(503, "backendError"), { category_hint: "unavailable", outcome: "uncertain" }],
  ];

  it.each(cases)("%s", async (_n, response, expected) => {
    const r = await run(vi.fn().mockResolvedValue(response));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatchObject(expected);
      expect(StandardErrorSchema.safeParse(r.error).success).toBe(true);
    }
  });

  it("400 about the recipient is an invalid value on the To field", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "invalidArgument", "Invalid To header")));
    expect(r).toMatchObject({ ok: false, error: { category_hint: "invalid_value", field: "to", outcome: "not_executed" } });
  });

  it("a recipient Gmail rejected that we sent empty is a missing field", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "invalidArgument", "Invalid To header")), { ...values, to: "" });
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "to" } });
  });

  it("400 saying the recipient is required is a missing field", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "invalidArgument", "Recipient address required")));
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "to" } });
  });

  it("masks quoted values and addresses Google echoes back, and never returns the token", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "invalidArgument", 'Invalid "Weekly update" for guest@example.com Bearer ya29.secret-access-token')));
    const text = JSON.stringify(r);
    for (const leak of ["Weekly update", "guest@example.com", "ya29.secret-access-token"]) expect(text).not.toContain(leak);
  });
});

describe("send_email: uncertain outcomes and the contract", () => {
  it("a timeout is uncertain, because Gmail may have sent the email", async () => {
    const hang = vi.fn((_u: string, init: RequestInit) =>
      new Promise<Response>((_r, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" })))),
    );
    const r = await run(hang as unknown as typeof fetch, values, { ...ctx, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, error: { code: "timeout", outcome: "uncertain", retryable: true } });
  });

  it("a dropped connection is uncertain too", async () => {
    expect(await run(vi.fn().mockRejectedValue(new TypeError("fetch failed")))).toMatchObject({ ok: false, error: { code: "network_error", outcome: "uncertain" } });
  });

  it("rejects an unknown action without calling Gmail", async () => {
    const fetchFn = vi.fn();
    const r = await createGmailAdapter(fetchFn).execute("delete_email", values, ctx);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, error: { code: "unknown_action" } });
  });

  it("is the Gmail adapter on the Google provider", () => {
    const a = createGmailAdapter(vi.fn());
    expect([a.id, a.provider, a.actions.map((x) => x.key)]).toEqual(["gmail", "google", ["send_email"]]);
  });
});
