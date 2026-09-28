import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import type { ActionConfig, TriggerSchema } from "@/lib/schemas/workflow-config";
import { classify } from "@/server/diagnosis/rules";
import type { RuleInput } from "@/server/diagnosis/rules/types";

const triggerSchema: TriggerSchema = {
  fields: [{ key: "value", label: "Value", type: "text" }],
};

function fixtureInput(app: string, name: string, over: Partial<RuleInput> = {}): RuleInput {
  const fixture = JSON.parse(readFileSync(`tests/fixtures/${app}/${name}.json`, "utf8")) as {
    mapped: { error: unknown };
  };
  return {
    error: StandardErrorSchema.parse(fixture.mapped.error),
    config: {},
    resolved: {},
    triggerSchema,
    triggerData: {},
    actionFields: [],
    ...over,
  };
}

describe("recorded authentication failures", () => {
  for (const [app, fixture] of [
    ["gmail", "invalid_token"],
    ["google-drive", "invalid_token"],
    ["slack", "invalid_token"],
  ] as const) {
    it(`${app}: offers reconnect guidance and no configuration change`, () => {
      const classification = classify(fixtureInput(app, fixture));
      expect(classification.category).toBe("expired_connection");
      expect(classification.candidates).toEqual([
        {
          id: "reconnect",
          kind: "reconnect_guidance",
          description: "Reconnect the app and try again",
        },
      ]);
      expect(classification.candidates[0]).not.toHaveProperty("fieldPath");
      expect(classification.candidates[0]).not.toHaveProperty("proposedValue");
      expect(classification.ceiling).toBe("high");
    });
  }
});

describe("recorded invalid values without a safe transform", () => {
  it("Gmail invalid recipient is diagnosed but receives no invented fix", () => {
    const config: ActionConfig = { to: { kind: "mapped", source: "value" } };
    const classification = classify(
      fixtureInput("gmail", "invalid_to", {
        config,
        resolved: { to: "not-an-email" },
        triggerData: { value: "not-an-email" },
        actionFields: [{ key: "to", label: "To", required: true, type: "email" }],
      }),
    );

    expect(classification.category).toBe("invalid_format");
    expect(classification.candidates).toEqual([]);
    expect(classification.ceiling).toBe("low");
  });
});
