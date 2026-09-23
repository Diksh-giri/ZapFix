import { AppError } from "@/lib/errors";

/** The thin wrapper around the model (Decision #017: the provider must stay swappable). */
export interface AiClient {
  complete(input: { system: string; user: string; timeoutMs: number }): Promise<string>;
}

/**
 * TODO(T22): implement with @anthropic-ai/sdk. Read AI_MODEL from env (never hard-code the
 * model), enforce timeoutMs, low temperature, return the raw text. Do NOT log the payload.
 */
export function createAnthropicClient(): AiClient {
  return {
    async complete() {
      throw new AppError("not_implemented", "AI client is not implemented yet (T22).");
    },
  };
}
