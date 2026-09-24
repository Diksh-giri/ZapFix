import { describe, expect, it, vi } from "vitest";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import { createGoogleDriveAdapter } from "@/server/adapters/google-drive";

const values = { name: "notes.txt", content: "Hello from ZapFix" };
const ctx = { accessToken: "ya29.secret-access-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000 };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const googleError = (status: number, reason: string, message = "Something", location?: string) =>
  json({ error: { code: status, message, errors: [{ domain: "global", reason, message, ...(location ? { location } : {}) }] } }, status);

async function run(fetchFn: typeof fetch, v: Record<string, string> = values, c = ctx) {
  return createGoogleDriveAdapter(fetchFn).execute("create_file", v, c);
}

/** Splits a multipart/related body into its two parts using the boundary from the content-type header. */
function parts(fetchFn: ReturnType<typeof vi.fn>) {
  const init = fetchFn.mock.calls[0]![1] as RequestInit;
  const type = (init.headers as Record<string, string>)["content-type"]!;
  const boundary = /boundary=([^;]+)/.exec(type)![1]!;
  const body = String(init.body);
  const chunks = body.split(`--${boundary}`).slice(1, -1).map((c) => c.replace(/^\r\n/, "").replace(/\r\n$/, ""));
  return { type, boundary, chunks, closes: body.trimEnd().endsWith(`--${boundary}--`) };
}

describe("create_file: the request", () => {
  it("uploads one text file with a multipart request: metadata part then content part", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: "1AbC", name: "notes.txt" }));
    await run(fetchFn);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://www.googleapis.com/upload/drive/v3/files");
    expect(u.searchParams.get("uploadType")).toBe("multipart");
    expect(u.searchParams.get("fields")).toBe("id");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ya29.secret-access-token");

    const p = parts(fetchFn);
    expect(p.type).toMatch(/^multipart\/related; boundary=/);
    expect(p.closes).toBe(true);
    expect(p.chunks).toHaveLength(2);
    const [meta, content] = p.chunks.map((c) => c.split("\r\n\r\n"));
    expect(meta![0]).toContain("Content-Type: application/json");
    expect(JSON.parse(meta![1]!)).toEqual({ name: "notes.txt", mimeType: "text/plain" });
    expect(content![0]).toContain("Content-Type: text/plain");
    expect(content![1]).toBe("Hello from ZapFix");
  });

  it("uses a fresh random boundary each time, never present in the content", async () => {
    const a = vi.fn().mockResolvedValue(json({ id: "1" }));
    const b = vi.fn().mockResolvedValue(json({ id: "1" }));
    await run(a, { name: "a.txt", content: "--x\r\n--y" });
    await run(b);
    expect(parts(a).boundary).not.toBe(parts(b).boundary);
    expect(parts(a).chunks).toHaveLength(2);
    expect(String((a.mock.calls[0]![1] as RequestInit).body).split(parts(a).boundary).length).toBe(4); // 2 parts + closing delimiter
  });

  it("sends an empty file when no content is mapped", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: "1" }));
    await run(fetchFn, { name: "empty.txt" });
    expect(parts(fetchFn).chunks[1]!.split("\r\n\r\n")[1]).toBe("");
  });

  it("sends an empty name to Drive as it is, so Drive's real behavior is what we record", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: "1" }));
    await run(fetchFn, { name: "", content: "x" });
    expect(JSON.parse(parts(fetchFn).chunks[0]!.split("\r\n\r\n")[1]!).name).toBe("");
  });
});

describe("create_file: success", () => {
  it("returns the file id and a summary with shapes only", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({ id: "1AbC" })));
    expect(r).toEqual({ ok: true, externalRef: "1AbC", requestSummary: { name: "provided", content: "provided" } });
    expect(JSON.stringify(r)).not.toContain("notes.txt");
    expect(JSON.stringify(r)).not.toContain("Hello from ZapFix");
  });

  it("marks a missing or empty value as empty", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({ id: "1" })), { name: "a.txt" });
    expect(r.requestSummary).toEqual({ name: "provided", content: "empty" });
  });

  it("does not claim success when Drive answers 200 without an id", async () => {
    expect(await run(vi.fn().mockResolvedValue(json({})))).toMatchObject({ ok: false, error: { outcome: "uncertain" } });
  });
});

describe("create_file: failures become StandardErrors", () => {
  const cases: Array<[string, Response, Record<string, unknown>]> = [
    ["401", googleError(401, "authError", "Invalid Credentials"), { category_hint: "auth", outcome: "not_executed" }],
    ["403 insufficient permissions", googleError(403, "insufficientPermissions"), { category_hint: "auth" }],
    ["403 storage full is not an auth problem", googleError(403, "storageQuotaExceeded"), { category_hint: "unknown", retryable: false }],
    ["403 rate limit", googleError(403, "rateLimitExceeded"), { category_hint: "rate_limit", retryable: true }],
    ["403 user rate limit", googleError(403, "userRateLimitExceeded"), { category_hint: "rate_limit" }],
    ["429", googleError(429, "rateLimitExceeded"), { category_hint: "rate_limit", outcome: "not_executed" }],
    ["404", googleError(404, "notFound"), { category_hint: "not_found" }],
    ["500", googleError(500, "backendError"), { category_hint: "unavailable", outcome: "uncertain" }],
  ];

  it.each(cases)("%s", async (_n, response, expected) => {
    const r = await run(vi.fn().mockResolvedValue(response));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatchObject(expected);
      expect(StandardErrorSchema.safeParse(r.error).success).toBe(true);
    }
  });

  it("400 is an invalid value, on the name when Drive points at it", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "invalid", "Invalid value for name", "name")));
    expect(r).toMatchObject({ ok: false, error: { category_hint: "invalid_value", field: "name", outcome: "not_executed" } });
  });

  it("a name Drive rejected that we sent empty is a missing field", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "invalid", "Invalid value for name", "name")), { name: "", content: "x" });
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "name" } });
  });

  it("masks quoted values Drive echoes back, and never returns the token", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "invalid", 'Bad "notes.txt" Bearer ya29.secret-access-token')));
    const text = JSON.stringify(r);
    for (const leak of ["notes.txt", "ya29.secret-access-token"]) expect(text).not.toContain(leak);
  });
});

describe("create_file: uncertain outcomes and the contract", () => {
  it("a timeout is uncertain, because Drive may have created the file", async () => {
    const hang = vi.fn((_u: string, init: RequestInit) =>
      new Promise<Response>((_r, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" })))),
    );
    const r = await run(hang as unknown as typeof fetch, values, { ...ctx, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, error: { code: "timeout", outcome: "uncertain" } });
  });

  it("a dropped connection is uncertain too", async () => {
    expect(await run(vi.fn().mockRejectedValue(new TypeError("fetch failed")))).toMatchObject({ ok: false, error: { code: "network_error", outcome: "uncertain" } });
  });

  it("rejects an unknown action without calling Drive", async () => {
    const fetchFn = vi.fn();
    const r = await createGoogleDriveAdapter(fetchFn).execute("delete_file", values, ctx);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, error: { code: "unknown_action" } });
  });

  it("is the Drive adapter on the Google provider, with an optional content field", () => {
    const a = createGoogleDriveAdapter(vi.fn());
    expect([a.id, a.provider]).toEqual(["google_drive", "google"]);
    expect(a.actions[0]!.fields.map((f) => [f.key, f.required])).toEqual([["name", true], ["content", false]]);
  });
});
