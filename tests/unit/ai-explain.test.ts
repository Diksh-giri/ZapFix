import { describe, expect, it } from "vitest";
import { explainWithAi } from "@/server/diagnosis/ai/explain";
import type { AiClient } from "@/server/diagnosis/ai/client";
import type { AiPayload } from "@/server/diagnosis/ai/payload";

const payload: AiPayload = {
  category: "missing_required_field",
  error: { code: "required", message: "Missing" },
  fields: [],
  candidates: [{ id: "c1", description: "Use Email" }],
};
const goodJson = JSON.stringify({
  likely_cause: "Empty email.",
  explanation: "No email came through.",
  selected_candidate_id: "c1",
  why_this_fix: "Only email field.",
  confidence: "high",
  uncertainty_note: null,
});

const args = { payload, ceiling: "high" as const, timeoutMs: 1000 };

describe("explainWithAi (Decision #031)", () => {
  it("returns ok on a valid answer", async () => {
    const client: AiClient = { complete: async () => goodJson };
    expect((await explainWithAi({ client, ...args })).aiStatus).toBe("ok");
  });

  it("retries once after an invalid answer, then succeeds", async () => {
    let calls = 0;
    const client: AiClient = { complete: async () => (++calls === 1 ? "garbage" : goodJson) };
    expect((await explainWithAi({ client, ...args })).aiStatus).toBe("ok");
    expect(calls).toBe(2);
  });

  it("reports invalid after two bad answers", async () => {
    const client: AiClient = { complete: async () => "garbage" };
    expect((await explainWithAi({ client, ...args })).aiStatus).toBe("invalid");
  });

  it("reports unavailable when the client keeps failing, and never throws", async () => {
    let calls = 0;
    const client: AiClient = { complete: async () => { calls++; throw new Error("down"); } };
    expect((await explainWithAi({ client, ...args })).aiStatus).toBe("unavailable");
    expect(calls).toBe(2);
  });
});
