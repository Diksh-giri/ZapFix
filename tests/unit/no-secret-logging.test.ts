import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Safety test 8 (static part): the connect flow must not be able to log tokens, codes or secrets. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

const sources = [...files("server/connections"), ...files("app/api/connections")];

describe("connections code never logs", () => {
  it("has files to check", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it.each(sources)("%s has no console output or raw env dump", (file) => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toMatch(/console\.(log|info|warn|error|debug|trace)/);
    expect(text).not.toMatch(/JSON\.stringify\(\s*process\.env/);
  });

  it("does not put a token, code or secret in any redirect or error message template", () => {
    const text = sources.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(text).not.toMatch(/new Error\(`[^`]*\$\{(code|token|secret|refreshToken|accessToken|clientSecret)\b/);
    expect(text).not.toMatch(/redirectTo[^;\n]*\$\{(code|token|secret)\b/);
  });
});
