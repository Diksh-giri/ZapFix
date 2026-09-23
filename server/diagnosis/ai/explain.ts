import type { Confidence } from "@/lib/types";
import type { AiOutput } from "@/lib/schemas/ai-output";
import type { AiClient } from "./client";
import type { AiPayload } from "./payload";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { validateAiOutput } from "./validate";

export type AiStatus = "ok" | "invalid" | "unavailable";
export type ExplainResult = { aiStatus: "ok"; output: AiOutput } | { aiStatus: "invalid" | "unavailable" };

/**
 * TDD section 15 steps 1-3: validate; on invalid output or an error, retry ONCE;
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
        user: buildUserMessage(payload),
        timeoutMs,
      });
      const result = validateAiOutput(raw, payload.candidates, ceiling);
      if (result.ok) return { aiStatus: "ok", output: result.output };
      lastFailure = "invalid";
    } catch {
      lastFailure = "unavailable";
    }
  }
  return { aiStatus: lastFailure };
}
