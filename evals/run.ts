/**
 * AI + rules evaluation runner (Decision #029, task T24). Run: npm run eval
 *
 * Today it checks the RULES half (category, supported, candidate ids, ceiling) against each case.
 * TODO(T24): also call the AI (server/diagnosis/ai) for each case and check the AI half:
 *   schema valid, selected fix on the list, no fix when there should be none, confidence within
 *   ceiling, no personal content in the payload. Gates (proposed): zero off-list picks,
 *   zero fixes on unsupported cases, at least 90% correct overall.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { classify } from "../server/diagnosis/rules";
import type { RuleInput } from "../server/diagnosis/rules/types";

interface EvalCase {
  id: string;
  input: RuleInput;
  expected: { category: string; supported: boolean; candidateIds: string[]; ceiling: string };
}

const dir = path.join(__dirname, "cases");
const cases: EvalCase[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as EvalCase[]);

let failed = 0;
for (const c of cases) {
  const got = classify(c.input);
  const problems: string[] = [];
  if (got.category !== c.expected.category) problems.push(`category ${got.category} != ${c.expected.category}`);
  if (got.supported !== c.expected.supported) problems.push(`supported ${got.supported} != ${c.expected.supported}`);
  if (got.ceiling !== c.expected.ceiling) problems.push(`ceiling ${got.ceiling} != ${c.expected.ceiling}`);
  const ids = got.candidates.map((x) => x.id).sort().join(",");
  if (ids !== [...c.expected.candidateIds].sort().join(",")) problems.push(`candidates [${ids}]`);
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${c.id}${problems.length ? ": " + problems.join("; ") : ""}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
