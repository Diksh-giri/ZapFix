import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("server/audit/metrics.sql", "utf8");
const queries = [...sql.matchAll(/^-- name: (\w+)\n([\s\S]*?)(?=^-- name: |\s*$(?![\s\S]))/gm)].map((m) => ({
  name: m[1]!,
  body: m[2]!.trim(),
}));

describe("saved PRD metric queries", () => {
  it.each([
    "approvals_with_change",
    "unapproved_changes",
    "time_from_failure_to_decision",
    "recovery_rate",
    "retries_per_resolved_run",
    "restore_success",
  ])("has the %s query", (name) => {
    const q = queries.find((x) => x.name === name);
    expect(q, `missing query ${name}`).toBeDefined();
    expect(q!.body.length).toBeGreaterThan(20);
  });

  it("only reads: no writes or schema changes", () => {
    for (const q of queries) expect(q.body).not.toMatch(/\b(insert|update|delete|drop|truncate|alter|create)\b/i);
  });

  it("puts a semicolon at the end of every query so each can be run alone", () => {
    for (const q of queries) expect(q.body.trimEnd().endsWith(";")).toBe(true);
  });
});
