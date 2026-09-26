import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRoute } from "@/server/http/handler";

// The handler imports the session helper, which is marked server-only; Vitest is not a browser bundle.
vi.mock("server-only", () => ({}));

/**
 * Safety test 8: tokens, keys and personal content never reach logs, API responses or stored errors.
 * (The AI payload part is in ai-payload.test.ts; the connect flow and AI code are in their own static checks.)
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

// Everything that handles runs, proposals, events, adapters and the API. The one shared logger is server/http/handler.ts.
const dirs = ["server/runs", "server/proposals", "server/changes", "server/audit", "server/adapters", "server/workflows", "app/api"];
const sources = dirs.flatMap(files);

describe("no console output outside the one shared error logger", () => {
  it("has files to check", () => expect(sources.length).toBeGreaterThan(30));

  it.each(sources)("%s has no console output or raw env dump", (file) => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toMatch(/console\.(log|info|warn|error|debug|trace)/);
    expect(text).not.toMatch(/JSON\.stringify\(\s*process\.env/);
  });
});

describe("the shared error logger and API error responses", () => {
  const SECRET = "sk-ant-REALLYSECRET-1234 refresh_token=abc.def tester@example.com";
  afterEach(() => vi.restoreAllMocks());

  const call = (fn: () => Promise<unknown>) =>
    apiRoute({ auth: false }, fn)(new Request("http://localhost/api/x", { method: "POST" }), { params: Promise.resolve({}) });

  it("answers an unexpected error with a fixed message, never the error's own text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(async () => {
      throw new Error(SECRET);
    });
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("REALLYSECRET");
    expect(text).not.toContain("refresh_token");
    expect(text).not.toContain("tester@example.com");
    expect(JSON.parse(text)).toEqual({ error: { code: "internal", message: "Something went wrong." } });
  });

  it("does not write the error's text, its cause or its fields to the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error(SECRET, { cause: new Error(SECRET) }), { detail: SECRET, code: "23505" });
    await call(async () => {
      throw err;
    });
    expect(log).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toMatch(/REALLYSECRET|refresh_token|tester@example\.com/);
    expect(logged).toContain("23505"); // the error code is kept: it is how a developer finds the problem
  });

  it("does not log anything for an expected AppError", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { AppError } = await import("@/lib/errors");
    const res = await call(async () => {
      throw new AppError("not_found", "Nothing here.");
    });
    expect(res.status).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });
});
