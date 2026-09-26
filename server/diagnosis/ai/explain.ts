import type { Confidence } from "@/lib/types";
import type { AiOutput } from "@/lib/schemas/ai-output";
import { AiCallError, type AiClient } from "./client";
import type { AiPayload } from "./payload";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { validateAiOutput } from "./validate";

export type AiStatus = "ok" | "invalid" | "unavailable";
export type ExplainResult = { aiStatus: "ok"; output: AiOutput } | { aiStatus: "invalid" | "unavailable" };

/**
 * TDD section 15 steps 1-3: validate; on invalid output or a retryable error, retry ONCE;
 * after that, report "invalid" / "unavailable" so the caller shows manual mode
 * (Decision #031). Never throws for model problems.
 */
export async function explainWithAi(args: {
  client: AiClient;
  payload: AiPayload;
  ceiling: Confidence;
  timeoutMs: number;
}): Promise<ExplainResult> {
  const { client, payload, ceiling, timeoutMs } = args;
  let lastFailure: "invalid" | "unavailable" = "unavailable";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await client.complete({
        system: SYSTEM_PROMPT,
        user: buildUserMessage(payload, { ceiling }),
        timeoutMs,
      });
      const result = validateAiOutput(raw, payload.candidates, ceiling);
      if (result.ok) return { aiStatus: "ok", output: result.output };
      lastFailure = "invalid";
    } catch (err) {
      lastFailure = "unavailable";
      // No key, or a request the provider will always refuse: a second call cannot help and would waste time.
      if (err instanceof AiCallError && !err.retryable) break;
    }
  }
  return { aiStatus: lastFailure };
}

/**
 * The three diagnoses columns an AI result fills (TDD section 15, step 3): ai_status, ai_output, confidence.
 * Anything but a valid answer stores no output and no confidence, so the screen shows manual mode.
 */
export function toDiagnosisAi(result: ExplainResult): { aiStatus: AiStatus; aiOutput: AiOutput | null; confidence: Confidence | null } {
  return result.aiStatus === "ok"
    ? { aiStatus: "ok", aiOutput: result.output, confidence: result.output.confidence }
    : { aiStatus: result.aiStatus, aiOutput: null, confidence: null };
}
