import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The eleven safety tests (TDD section 22, T28) must all exist before testers are invited.
 * This lists where each one lives and fails if a file is deleted or its marker text is removed,
 * so a safety test cannot quietly disappear. docs/SAFETY_TESTS.md explains each one in plain words.
 * "db" tests run in CI (tests/db/run.sh); "integration" tests need a scratch database (see docs/SAFETY_TESTS.md).
 */
const SAFETY_TESTS: Array<{ n: number; name: string; where: Array<[file: string, marker: string]> }> = [
  { n: 1, name: "No config change without a valid approval", where: [["tests/db/safety.sql", "1a config change without a valid approval"], ["tests/unit/proposal-decision-confirm.test.ts", "safety tests 1 and 2"]] },
  { n: 2, name: "A value different from the approval is refused (tamper)", where: [["tests/db/safety.sql", "1c config change with a DIFFERENT value"], ["tests/unit/applier.test.ts", "safety test 2"], ["tests/unit/proposal-decision-confirm.test.ts", "safety tests 1 and 2"]] },
  { n: 3, name: "Approvals cannot be updated or deleted", where: [["tests/db/safety.sql", "3. approvals are append-only"]] },
  { n: 4, name: "Simultaneous retries create one attempt; a step never has two successes", where: [["tests/db/safety.sql", "4. one running attempt"], ["tests/unit/run-engine.test.ts", "safety tests 4 and 11"], ["tests/integration/runs-db.test.ts", "SAFETY TEST 4"]] },
  { n: 5, name: "Confirm is all-or-nothing", where: [["tests/unit/proposal-decision-confirm.test.ts", "safety test 5"], ["tests/integration/proposals-db.test.ts", "SAFETY TEST 5"]] },
  { n: 6, name: "Restore returns the exact before value; a manual edit gives manual_edit_conflict", where: [["tests/unit/proposal-restore.test.ts", "safety test 6"], ["tests/unit/applier.test.ts", "safety test 6"], ["tests/integration/proposals-db.test.ts", "SAFETY TEST 6"]] },
  { n: 7, name: "One user cannot read or change another user's rows", where: [["tests/db/safety.sql", "7. row-level security"]] },
  { n: 8, name: "Tokens never appear in AI payloads, logs, API responses or stored errors", where: [["tests/unit/ai-payload.test.ts", "safety test 8"], ["tests/unit/no-secret-logging.test.ts", "Safety test 8"], ["tests/unit/no-secret-leaks.test.ts", "Safety test 8"]] },
  { n: 9, name: "Off-list fix, over-ceiling confidence or bad JSON is rejected (manual mode)", where: [["tests/unit/ai-validate.test.ts", "safety test 9"]] },
  { n: 10, name: "After two applied-but-unsuccessful repairs, diagnosis refuses new proposals", where: [["tests/unit/run-guards.test.ts", "safety test 10"], ["tests/unit/run-engine.test.ts", "increments repair_count"]] },
  { n: 11, name: "An uncertain attempt cannot be retried without confirmation", where: [["tests/unit/run-guards.test.ts", "safety test 11"], ["tests/unit/run-engine.test.ts", "safety tests 4 and 11"], ["tests/integration/runs-db.test.ts", "SAFETY TEST 11"]] },
];

describe("the eleven safety tests all exist", () => {
  it("lists exactly eleven", () => {
    expect(SAFETY_TESTS.map((t) => t.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  for (const t of SAFETY_TESTS) {
    it(`#${t.n} ${t.name}`, () => {
      for (const [file, marker] of t.where) {
        expect(existsSync(file), `${file} is missing`).toBe(true);
        expect(readFileSync(file, "utf8"), `${file} no longer contains "${marker}"`).toContain(marker);
      }
    });
  }
});
