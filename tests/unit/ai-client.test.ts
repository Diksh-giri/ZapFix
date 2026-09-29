import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AiCallError, aiTimeoutMs, createAnthropicClient, MAX_OUTPUT_TOKENS, type AnthropicLike } from "@/server/diagnosis/ai/client";
import { explainWithAi } from "@/server/diagnosis/ai/explain";
import type { AiPayload } from "@/server/diagnosis/ai/payload";

type Params = Parameters<AnthropicLike["messages"]["create"]>[0];
type Options = Parameters<AnthropicLike["messages"]["create"]>[1];

const reply = (text: string, over: Record<string, unknown> = {}) => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 120, output_tokens: 40 },
  ...over,
});

function fakeSdk(result: () => unknown) {
  const create = vi.fn(async (_params: Params, _options: Options) => result() as never);
  const sdk: AnthropicLike = { messages: { create } };
  return { sdk, create };
}

const call = { system: "SYS", user: "USER", timeoutMs: 7000 };
const client = (sdk: AnthropicLike, over: Partial<Parameters<typeof createAnthropicClient>[0]> = {}) =>
  createAnthropicClient({ apiKey: "test-key", model: "test-model", sdk, ...over });

describe("createAnthropicClient: the request", () => {
  it("sends the model from settings (never hard-coded), the prompt, a capped output and low effort", async () => {
    const { sdk, create } = fakeSdk(() => reply("{}"));
    await client(sdk, { model: "some-model-from-env" }).complete(call);
    const [params, options] = create.mock.calls[0]!;
    expect(params).toMatchObject({
      model: "some-model-from-env",
      max_tokens: MAX_OUTPUT_TOKENS,
      system: "SYS",
      messages: [{ role: "user", content: "USER" }],
      output_config: { effort: "low" },
    });
    expect(options).toEqual({ timeout: 7000, maxRetries: 0 });
  });

  it("gives the model no tools and no sampling settings (current models reject temperature)", async () => {
    const { sdk, create } = fakeSdk(() => reply("{}"));
    await client(sdk).complete(call);
    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    for (const key of ["tools", "tool_choice", "temperature", "top_p", "top_k", "mcp_servers", "thinking"]) {
      expect(params).not.toHaveProperty(key);
    }
  });

  it("reads the model from AI_MODEL when none is passed", async () => {
    const { sdk, create } = fakeSdk(() => reply("{}"));
    vi.stubEnv("AI_MODEL", "env-model");
    try {
      await createAnthropicClient({ apiKey: "k", sdk }).complete(call);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(create.mock.calls[0]![0].model).toBe("env-model");
  });
});

describe("createAnthropicClient: the answer", () => {
  it("returns the text of the reply", async () => {
    const { sdk } = fakeSdk(() => reply('{"a":1}'));
    await expect(client(sdk).complete(call)).resolves.toBe('{"a":1}');
  });

  it("joins several text blocks and ignores other block types", async () => {
    const { sdk } = fakeSdk(() =>
      reply("", { content: [{ type: "thinking", thinking: "" }, { type: "text", text: "{" }, { type: "text", text: "}" }] }),
    );
    await expect(client(sdk).complete(call)).resolves.toBe("{}");
  });

  it.each([
    ["a refusal", { stop_reason: "refusal" }, "refused"],
    ["a reply cut off at the token cap", { stop_reason: "max_tokens" }, "truncated"],
    ["a reply with no text", { content: [{ type: "thinking", thinking: "" }] }, "empty"],
    ["a blank reply", { content: [{ type: "text", text: "  " }] }, "empty"],
  ])("throws for %s, so the caller retries once and then shows manual mode", async (_why, over, reason) => {
    const { sdk } = fakeSdk(() => reply("{}", over));
    await expect(client(sdk).complete(call)).rejects.toMatchObject({ name: "AiCallError", reason });
  });

  it("reports only token counts to onUsage, never the prompt or the reply", async () => {
    const onUsage = vi.fn();
    const { sdk } = fakeSdk(() => reply("secret reply"));
    await client(sdk, { onUsage }).complete(call);
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 120, outputTokens: 40 });
    expect(JSON.stringify(onUsage.mock.calls)).not.toMatch(/SYS|USER|secret reply/);
  });
});

describe("createAnthropicClient: when it cannot or should not call", () => {
  it.each([
    ["no API key", { apiKey: "" }, "no_key"],
    ["a blank API key", { apiKey: "   " }, "no_key"],
    ["no model", { model: "" }, "no_model"],
  ])("makes no request with %s, and says the problem is not worth retrying", async (_why, over, reason) => {
    const { sdk, create } = fakeSdk(() => reply("{}"));
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    try {
      const err = await client(sdk, over).complete(call).catch((e) => e);
      expect(err).toBeInstanceOf(AiCallError);
      expect(err).toMatchObject({ reason, retryable: false });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(create).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404])("treats an API %i as not retryable", async (status) => {
    const { sdk } = fakeSdk(() => {
      throw Object.assign(new Error("boom"), { status });
    });
    await expect(client(sdk).complete(call)).rejects.toMatchObject({ reason: "api_error", retryable: false });
  });

  it.each([429, 500, 529, undefined])("treats an API %s as retryable", async (status) => {
    const { sdk } = fakeSdk(() => {
      throw Object.assign(new Error("boom"), { status });
    });
    await expect(client(sdk).complete(call)).rejects.toMatchObject({ reason: "api_error", retryable: true });
  });

  it("never puts the original error text, the key or the prompt into the error it throws", async () => {
    const { sdk } = fakeSdk(() => {
      throw Object.assign(new Error("echo: SYS USER test-key"), { status: 500 });
    });
    const err = (await client(sdk).complete(call).then(() => new Error("no error"), (e: unknown) => e)) as Error;
    expect(err.message).not.toMatch(/SYS|USER|test-key|echo/);
  });
});

describe("createAnthropicClient: a model that rejects output_config.effort (e.g. Haiku 4.5)", () => {
  const effortRejected = () =>
    Object.assign(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support the effort parameter."}}'),
      { status: 400 },
    );

  it("retries once, in the same call, without output_config, and returns that answer", async () => {
    let calls = 0;
    const create = vi.fn(async (_params: Params, _options: Options) => {
      calls += 1;
      if (calls === 1) throw effortRejected();
      return reply('{"ok":true}') as never;
    });
    const sdk: AnthropicLike = { messages: { create } };
    await expect(client(sdk).complete(call)).resolves.toBe('{"ok":true}');
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]![0]).toMatchObject({ output_config: { effort: "low" } });
    expect(create.mock.calls[1]![0]).not.toHaveProperty("output_config");
  });

  it("reports usage from the fallback call, not the rejected one", async () => {
    const onUsage = vi.fn();
    let calls = 0;
    const create = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw effortRejected();
      return reply("{}", { usage: { input_tokens: 5, output_tokens: 9 } });
    });
    const sdk: AnthropicLike = { messages: { create } };
    await client(sdk, { onUsage }).complete(call);
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 5, outputTokens: 9 });
  });

  it("still fails, mapped from the fallback call's own status, if the fallback call also fails", async () => {
    let calls = 0;
    const create = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw effortRejected();
      throw Object.assign(new Error("boom"), { status: 500 });
    });
    const sdk: AnthropicLike = { messages: { create } };
    await expect(client(sdk).complete(call)).rejects.toMatchObject({ reason: "api_error", retryable: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a real 400 that has nothing to do with the effort parameter", async () => {
    const { sdk, create } = fakeSdk(() => {
      throw Object.assign(new Error("boom"), { status: 400 });
    });
    await expect(client(sdk).complete(call)).rejects.toMatchObject({ reason: "api_error", retryable: false });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("explainWithAi with the real client's errors", () => {
  const payload: AiPayload = { category: "missing_required_field", error: { code: "x", message: "y" }, fields: [], candidates: [] };

  it("does not retry when the problem cannot be fixed by retrying (no key)", async () => {
    let calls = 0;
    const c = {
      complete: async () => {
        calls++;
        throw new AiCallError("no_key", false);
      },
    };
    await expect(explainWithAi({ client: c, payload, ceiling: "high", timeoutMs: 1 })).resolves.toEqual({ aiStatus: "unavailable" });
    expect(calls).toBe(1);
  });

  it("still retries once for a retryable failure", async () => {
    let calls = 0;
    const c = {
      complete: async () => {
        calls++;
        throw new AiCallError("api_error", true);
      },
    };
    await expect(explainWithAi({ client: c, payload, ceiling: "high", timeoutMs: 1 })).resolves.toEqual({ aiStatus: "unavailable" });
    expect(calls).toBe(2);
  });
});

describe("aiTimeoutMs", () => {
  it("reads AI_CALL_TIMEOUT_MS and falls back to 25 seconds", () => {
    for (const [value, expected] of [["12000", 12000], ["", 25000], ["abc", 25000], ["-5", 25000], ["0", 25000]] as const) {
      vi.stubEnv("AI_CALL_TIMEOUT_MS", value);
      expect(aiTimeoutMs()).toBe(expected);
    }
    vi.unstubAllEnvs();
  });
});

describe("AI code never logs (safety test 8, static part)", () => {
  const dir = "server/diagnosis/ai";
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

  it("has files to check", () => expect(files.length).toBeGreaterThan(4));

  it.each(files)("%s has no console output or raw env dump", (file) => {
    const text = readFileSync(`${dir}/${file}`, "utf8");
    expect(text).not.toMatch(/console\.(log|info|warn|error|debug|trace)/);
    expect(text).not.toMatch(/JSON\.stringify\(\s*process\.env/);
  });
});
