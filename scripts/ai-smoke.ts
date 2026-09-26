import { existsSync } from "node:fs";
import { AiCallError, aiTimeoutMs, createAnthropicClient } from "../server/diagnosis/ai/client";
import { explainWithAi } from "../server/diagnosis/ai/explain";
import { buildAiPayload } from "../server/diagnosis/ai/payload";

/**
 * One real AI call, to check the whole path once (T22/T23): payload -> prompt -> model -> validation.
 *   npx tsx scripts/ai-smoke.ts
 * Needs ANTHROPIC_API_KEY and AI_MODEL in .env.local. Without a key it makes NO request and spends nothing.
 * It sends made-up field names and shapes only (never real data), and prints only the status, the checked
 * answer and token counts. It never prints the key, the prompt or the raw reply. At most two calls (one retry).
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local"); // existing variables are not overridden

if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.log("No ANTHROPIC_API_KEY in .env.local: nothing was sent and nothing was spent.");
  process.exit(0);
}

const payload = buildAiPayload({
  category: "missing_required_field",
  error: { category_hint: "missing_field", code: "required", message: "Missing required field: attendee_email", field: "attendee_email", retryable: false, outcome: "not_executed" },
  config: { title: { kind: "static", value: "Kickoff" }, attendee_email: { kind: "mapped", source: "email" } },
  resolved: { title: "Kickoff", attendee_email: "" },
  candidates: [
    { id: "map:attendee_email:contact_email", kind: "config_change", fieldPath: "actionConfig.attendee_email", proposedValue: { kind: "mapped", source: "contact_email" }, description: 'Use "Contact email" for Attendee email' },
    { id: "map:attendee_email:work_email", kind: "config_change", fieldPath: "actionConfig.attendee_email", proposedValue: { kind: "mapped", source: "work_email" }, description: 'Use "Work email" for Attendee email' },
  ],
});

async function main(): Promise<void> {
  let input = 0;
  let output = 0;
  const client = createAnthropicClient({
    onUsage: (u) => {
      input += u.inputTokens;
      output += u.outputTokens;
    },
  });

  try {
    const result = await explainWithAi({ client, payload, ceiling: "medium", timeoutMs: aiTimeoutMs() });
    console.log("AI status:", result.aiStatus);
    if (result.aiStatus === "ok") console.log("Checked answer:", JSON.stringify(result.output, null, 2));
  } catch (err) {
    console.log("Failed:", err instanceof AiCallError ? err.reason : "unknown");
  }
  console.log(`Tokens used: ${input} in, ${output} out (model ${process.env.AI_MODEL ?? "unset"}).`);
}

void main();
