/**
 * Rules + AI evaluation runner (Decision #029, task T24). Run: npm run eval
 *
 * Checks the RULES half (category, supported, candidate ids, ceiling) against every case, THEN
 * the AI half the same way production calls it (server/diagnosis/service.ts): build the payload
 * from the rules' own output and run it through explainWithAi, which already enforces schema
 * validity, an on-list pick, and confidence within the rules' ceiling (server/diagnosis/ai/validate.ts).
 * This file only adds: replay vs. live, and a check that the payload never carries raw values.
 *
 * Modes:
 *   npm run eval                 replay recorded AI responses (evals/ai-recordings/<id>.txt). No
 *                                 network call, no cost -- this is what CI runs.
 *   npm run eval -- --live       call the real model for every case (needs ANTHROPIC_API_KEY).
 *   npm run eval -- --live --record   also save the exact replies that passed as recordings.
 *   npm run eval -- --rules-only skip the AI half entirely (fast, matches the old behavior).
 *
 * A case with no recording and no --live is reported as a gap, not a failure: recordings are
 * added incrementally by running --live --record once a case is written.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classify } from "../server/diagnosis/rules";
import type { RuleInput } from "../server/diagnosis/rules/types";
import { buildAiPayload } from "../server/diagnosis/ai/payload";
import { aiTimeoutMs, createAnthropicClient, type AiClient } from "../server/diagnosis/ai/client";
import { explainWithAi } from "../server/diagnosis/ai/explain";

interface EvalCase {
  id: string;
  input: RuleInput;
  expected: { category: string; supported: boolean; candidateIds: string[]; ceiling: string };
}

const LIVE = process.argv.includes("--live");
const RECORD = process.argv.includes("--record");
const RULES_ONLY = process.argv.includes("--rules-only");

const casesDir = path.join(__dirname, "cases");
const recordingsDir = path.join(__dirname, "ai-recordings");

const cases: EvalCase[] = readdirSync(casesDir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(path.join(casesDir, f), "utf8")) as EvalCase[]);

function replayClient(raw: string): AiClient {
  return { async complete() { return raw; } };
}

/** Wraps a real client and remembers the text of its last successful reply, so a passing
 * response can be saved as-is -- never a second, possibly different, live call. */
function capturingClient(inner: AiClient): { client: AiClient; lastRaw: () => string | null } {
  let last: string | null = null;
  return {
    client: {
      async complete(input) {
        const raw = await inner.complete(input);
        last = raw;
        return raw;
      },
    },
    lastRaw: () => last,
  };
}

/** The AI payload must carry field names and value shapes only (Decision #018) -- never a raw
 * value a person typed. Checked here by confirming none of the run's actual non-trivial string
 * values (trigger data, resolved values) appear verbatim in the serialized payload. */
function findLeakedValue(input: RuleInput, payloadJson: string): string | null {
  const candidates = [...Object.values(input.triggerData), ...Object.values(input.resolved)];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length >= 3 && payloadJson.includes(JSON.stringify(value).slice(1, -1))) {
      return value;
    }
  }
  return null;
}

async function checkAi(c: EvalCase, classification: ReturnType<typeof classify>): Promise<string[]> {
  const payload = buildAiPayload({
    category: classification.category,
    error: c.input.error,
    config: c.input.config,
    resolved: c.input.resolved,
    candidates: classification.candidates,
  });

  const payloadJson = JSON.stringify(payload);
  const leaked = findLeakedValue(c.input, payloadJson);
  if (leaked) return [`payload leaks a raw value into the AI request`];

  const recordingPath = path.join(recordingsDir, `${c.id}.txt`);
  let client: AiClient;
  let capture: (() => string | null) | null = null;
  if (LIVE) {
    const wrapped = capturingClient(createAnthropicClient({}));
    client = wrapped.client;
    capture = wrapped.lastRaw;
  } else if (existsSync(recordingPath)) {
    client = replayClient(readFileSync(recordingPath, "utf8"));
  } else {
    return [`SKIPPED (no recording; run "npm run eval -- --live --record" once to create ${path.relative(process.cwd(), recordingPath)})`];
  }

  const result = await explainWithAi({ client, payload, ceiling: classification.ceiling, timeoutMs: aiTimeoutMs() });
  if (result.aiStatus !== "ok") return [`AI call produced "${result.aiStatus}" instead of a valid answer`];

  if (LIVE && RECORD && capture) {
    const raw = capture();
    if (raw) {
      mkdirSync(recordingsDir, { recursive: true });
      writeFileSync(recordingPath, raw);
    }
  }

  return [];
}

async function main(): Promise<void> {
  let failed = 0;
  let skipped = 0;

  for (const c of cases) {
    const got = classify(c.input);
    const problems: string[] = [];
    if (got.category !== c.expected.category) problems.push(`category ${got.category} != ${c.expected.category}`);
    if (got.supported !== c.expected.supported) problems.push(`supported ${got.supported} != ${c.expected.supported}`);
    if (got.ceiling !== c.expected.ceiling) problems.push(`ceiling ${got.ceiling} != ${c.expected.ceiling}`);
    const ids = got.candidates.map((x) => x.id).sort().join(",");
    if (ids !== [...c.expected.candidateIds].sort().join(",")) problems.push(`candidates [${ids}]`);

    let skippedThisCase = false;
    if (!RULES_ONLY && problems.length === 0) {
      const aiProblems = await checkAi(c, got);
      if (aiProblems.length === 1 && aiProblems[0]!.startsWith("SKIPPED")) {
        skippedThisCase = true;
        skipped++;
      }
      problems.push(...aiProblems);
    }

    if (problems.length > 0 && !skippedThisCase) failed++;
    const label = skippedThisCase ? "skip" : problems.length ? "FAIL" : "ok  ";
    console.log(`${label} ${c.id}${problems.length ? ": " + problems.join("; ") : ""}`);
  }

  const checked = cases.length - skipped;
  console.log(`\n${checked - failed}/${checked} passed${skipped ? ` (${skipped} skipped: no recording)` : ""}`);
  process.exit(failed ? 1 : 0);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local"); // existing variables are not overridden
void main();
