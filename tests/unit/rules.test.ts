import { describe, expect, it } from "vitest";
import { classify } from "@/server/diagnosis/rules";
import { ceilingFor } from "@/server/diagnosis/rules/ceiling";
import type { RuleInput } from "@/server/diagnosis/rules/types";
import { fakeAdapter } from "@/server/adapters/fake";
import { resolveConfig } from "@/server/workflows/resolve";
import type { ActionConfig, TriggerData, TriggerSchema } from "@/lib/schemas/workflow-config";

const triggerSchema: TriggerSchema = {
  fields: [
    { key: "name", label: "Name", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "contact_email", label: "Contact email", type: "email" },
    { key: "meeting_date", label: "Meeting date", type: "date" },
  ],
};
const config: ActionConfig = {
  title: { kind: "mapped", source: "name" },
  start: { kind: "static", value: "2026-03-15T09:00:00Z" },
  end: { kind: "static", value: "2026-03-15T10:00:00Z" },
  attendee_email: { kind: "mapped", source: "email" },
};
const action = fakeAdapter.actions[0]!;

async function inputFor(trigger: TriggerData, cfg: ActionConfig = config): Promise<RuleInput> {
  const resolved = resolveConfig(cfg, trigger);
  const result = await fakeAdapter.execute("create_event", resolved, { accessToken: "ok", idempotencyKey: "r:a:1", timeoutMs: 1000 });
  if (result.ok) throw new Error("expected a failure");
  return { error: result.error, config: cfg, resolved, triggerSchema, triggerData: trigger, actionFields: action.fields };
}

describe("missing required field rule (worked example, T13)", () => {
  it("classifies an empty mapped value and offers other email fields, with medium ceiling for several", async () => {
    const c = classify(await inputFor({ name: "Kickoff", email: "", contact_email: "ana@example.com" }));
    expect(c.category).toBe("missing_required_field");
    expect(c.supported).toBe(true);
    expect(c.candidates.map((x) => x.id)).toEqual(["map:attendee_email:contact_email"]);
    expect(c.ceiling).toBe("high"); // exactly one candidate
    expect(c.evidence.find((e) => e.label === "Value received")?.value).toBe("empty");
  });

  it("does not propose another field that is also empty in this run", async () => {
    const c = classify(await inputFor({ name: "Kickoff", email: "", contact_email: "" }));
    expect(c.category).toBe("missing_required_field");
    expect(c.candidates).toEqual([]);
    expect(c.ceiling).toBe("low"); // no valid fix: no proposal is offered
  });

  it("only proposes fields of a compatible type", async () => {
    const c = classify(await inputFor({ name: "Kickoff", email: "", meeting_date: "03/15/2026" }));
    expect(c.candidates).toEqual([]); // the date field is not an email field
  });
});

describe("invalid format rule", () => {
  it("classifies an ambiguous slash date and offers only the two allowed date transforms", async () => {
    const input = await inputFor(
      { name: "Kickoff", email: "ana@example.com", meeting_date: "03/15/2026" },
      { ...config, start: { kind: "mapped", source: "meeting_date" } },
    );
    const c = classify(input);
    expect(c.category).toBe("invalid_format");
    expect(c.candidates.map((candidate) => candidate.id)).toEqual([
      "transform:start:MM/DD/YYYY",
      "transform:start:DD/MM/YYYY",
    ]);
    expect(c.candidates.every((candidate) => candidate.fieldPath === "actionConfig.start")).toBe(true);
    expect(c.ceiling).toBe("medium");
  });

  it("does not propose a format transform for an empty value", async () => {
    const input = await inputFor(
      { name: "Kickoff", email: "ana@example.com", meeting_date: "" },
      { ...config, start: { kind: "mapped", source: "meeting_date" } },
    );
    input.error = { ...input.error, category_hint: "invalid_value", field: "start" };
    const c = classify(input);
    expect(c.category).toBe("invalid_format");
    expect(c.candidates).toEqual([]);
    expect(c.ceiling).toBe("low");
  });

  it("classifies an authentication failure as reconnect guidance without a config change", async () => {
    const input = await inputFor({ name: "Kickoff", email: "" });
    input.error = {
      code: "authError",
      message: "Invalid Credentials",
      retryable: false,
      outcome: "not_executed",
      category_hint: "auth",
    };
    const c = classify(input);
    expect(c.category).toBe("expired_connection");
    expect(c.candidates).toEqual([
      {
        id: "reconnect",
        kind: "reconnect_guidance",
        description: "Reconnect the app and try again",
      },
    ]);
    expect(c.ceiling).toBe("high");
  });

  it("keeps an unknown error unsupported and offers no fix", async () => {
    const input = await inputFor({ name: "Kickoff", email: "" });
    input.error = {
      code: "channel_not_found",
      message: "The requested channel does not exist.",
      retryable: false,
      outcome: "not_executed",
      category_hint: "not_found",
      field: "channel",
    };
    const c = classify(input);
    expect(c.category).toBe("unsupported");
    expect(c.candidates).toEqual([]);
    expect(c.ceiling).toBe("low");
  });

});

describe("confidence ceiling (Decision #028)", () => {
  it("sets the ceiling from the evidence", () => {
    const cand = (id: string) => ({ id, kind: "config_change" as const, description: id });
    expect(ceilingFor("unsupported", [cand("a")])).toBe("low");
    expect(ceilingFor("missing_required_field", [])).toBe("low");
    expect(ceilingFor("missing_required_field", [cand("a")])).toBe("high");
    expect(ceilingFor("invalid_format", [cand("a"), cand("b")])).toBe("medium");
    expect(ceilingFor("expired_connection", [{ ...cand("reconnect"), kind: "reconnect_guidance" }])).toBe("high");
  });
});
