import Anthropic from "@anthropic-ai/sdk";

/** The thin wrapper around the model (Decision #017: the provider must stay swappable). */
export interface AiClient {
  complete(input: { system: string; user: string; timeoutMs: number }): Promise<string>;
}

/**
 * Room for the answer (about 300 tokens of JSON) plus a little thinking at low effort.
 * Too small a cap would cut the JSON off; the answer would then be rejected as invalid.
 */
export const MAX_OUTPUT_TOKENS = 1200;

/** AI_CALL_TIMEOUT_MS from settings, or 25 seconds (TDD Appendix F). */
export function aiTimeoutMs(): number {
  const n = Number(process.env.AI_CALL_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 25_000;
}

type FailureReason = "no_key" | "no_model" | "refused" | "truncated" | "empty" | "api_error";

/**
 * Why a call failed, and whether trying again could help. Its message is fixed text: it never carries the
 * prompt, the reply, the key or the provider's own error text.
 */
export class AiCallError extends Error {
  constructor(
    readonly reason: FailureReason,
    readonly retryable: boolean,
  ) {
    super(`The AI call failed (${reason}).`);
    this.name = "AiCallError";
  }
}

/** The one SDK method used, so tests can stand in for the real SDK without a key or any tokens. */
export interface AnthropicLike {
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        system: string;
        messages: Array<{ role: "user"; content: string }>;
        output_config?: { effort: "low" };
      },
      options: { timeout: number; maxRetries: number },
    ): Promise<{
      content: Array<{ type: string; text?: string }>;
      stop_reason: string | null;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

/** Errors the provider gives for a request that will fail the same way again. */
const NOT_RETRYABLE_STATUS = new Set([400, 401, 403, 404]);

/**
 * Some models (Haiku 4.5 at the time of writing) reject output_config.effort outright with a 400.
 * Not every model swap should need a code change here, so this is detected from the provider's own
 * refusal rather than a hard-coded model list. Matched on the message only: never true for a real
 * outage or a bad key, both of which get their own distinct wording from the provider.
 */
function isUnsupportedEffortError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  const message = err instanceof Error ? err.message : "";
  return status === 400 && /effort parameter/i.test(message);
}

/**
 * Anthropic implementation of AiClient (TDD section 15). Rules:
 *  - model from AI_MODEL, key from ANTHROPIC_API_KEY (never hard-coded; nothing is logged)
 *  - no tools, no sampling settings (current models reject temperature), low effort, capped output
 *  - low effort is retried once, in this same call, without output_config if the model rejects that
 *    field outright (see isUnsupportedEffortError) - a model-support gap, not a transient failure,
 *    so it must not consume explainWithAi's one external retry
 *  - the timeout is enforced per call; the SDK never retries by itself (explainWithAi retries once)
 *  - with no key or no model it makes NO request, so an unconfigured app costs nothing and shows manual mode
 * `onUsage` receives token counts only, for measuring cost. It never sees the prompt or the reply.
 */
export function createAnthropicClient(
  opts: {
    apiKey?: string;
    model?: string;
    sdk?: AnthropicLike;
    onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
  } = {},
): AiClient {
  let cached: { key: string; sdk: AnthropicLike } | undefined;

  const sdkFor = (key: string): AnthropicLike => {
    if (opts.sdk) return opts.sdk;
    if (!cached || cached.key !== key) cached = { key, sdk: new Anthropic({ apiKey: key, maxRetries: 0 }) as unknown as AnthropicLike };
    return cached.sdk;
  };

  return {
    async complete({ system, user, timeoutMs }) {
      const apiKey = (opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
      const model = (opts.model ?? process.env.AI_MODEL ?? "").trim();
      if (!apiKey) throw new AiCallError("no_key", false);
      if (!model) throw new AiCallError("no_model", false);

      const request = (withEffort: boolean) =>
        sdkFor(apiKey).messages.create(
          {
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            messages: [{ role: "user", content: user }],
            ...(withEffort ? { output_config: { effort: "low" as const } } : {}),
          },
          { timeout: timeoutMs, maxRetries: 0 },
        );

      let response;
      try {
        response = await request(true);
      } catch (err) {
        if (!isUnsupportedEffortError(err)) {
          const status = (err as { status?: unknown } | null)?.status;
          throw new AiCallError("api_error", !(typeof status === "number" && NOT_RETRYABLE_STATUS.has(status)));
        }
        try {
          response = await request(false);
        } catch (err2) {
          const status = (err2 as { status?: unknown } | null)?.status;
          throw new AiCallError("api_error", !(typeof status === "number" && NOT_RETRYABLE_STATUS.has(status)));
        }
      }

      opts.onUsage?.({ inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });

      if (response.stop_reason === "refusal") throw new AiCallError("refused", false);
      if (response.stop_reason === "max_tokens") throw new AiCallError("truncated", true);
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      if (!text.trim()) throw new AiCallError("empty", true);
      return text;
    },
  };
}
