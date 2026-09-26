import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createGoogleDriveAdapter } from "@/server/adapters/google-drive";

/** Replays the REAL Google Drive responses recorded by scripts/record-drive-fixtures.ts through the adapter. */
const good = { name: "notes.txt", content: "hello" };
const scenarios: Record<string, Record<string, string>> = {
  success: good,
  empty_name: { ...good, name: "" },
  empty_content: { ...good, content: "" },
  invalid_token: good,
};

function load(name: string) {
  return JSON.parse(readFileSync(`tests/fixtures/google-drive/${name}.json`, "utf8")) as {
    response: { status: number; body: unknown };
    mapped: { ok: boolean; error?: Record<string, unknown> };
  };
}

async function replay(name: string) {
  const f = load(name);
  const fetchFn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(f.response.body), { status: f.response.status, headers: { "content-type": "application/json" } }),
  );
  const r = await createGoogleDriveAdapter(fetchFn).execute("create_file", scenarios[name]!, {
    accessToken: "ya29.replay-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000,
  });
  return { r, f };
}

describe("real Google Drive responses (recorded fixtures)", () => {
  it("an invalid token is an auth failure that was not executed", async () => {
    const { r } = await replay("invalid_token");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "auth", code: "authError", outcome: "not_executed", retryable: false } });
  });

  it("Drive itself accepts an empty file name and empty content, so ZapFix must catch an empty name before the call", async () => {
    for (const name of ["empty_name", "empty_content"]) {
      const { f } = await replay(name);
      expect(f.response.status).toBe(200);
    }
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

  it("holds no personal data, tokens or real file ids", () => {
    for (const name of Object.keys(scenarios)) {
      const text = readFileSync(`tests/fixtures/google-drive/${name}.json`, "utf8");
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // no email addresses
      expect(text).not.toMatch(/ya29\.|Bearer\s+\w/); // no tokens
      expect(text).not.toMatch(/"id": "(?!\[id\])/); // ids are masked
    }
  });
});
