import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import type { ActionConfig, TriggerSchema } from "@/lib/schemas/workflow-config";
import { googleCalendarAdapter } from "@/server/adapters/google-calendar";
import { resolveConfig } from "@/server/workflows/resolve";
import { classify } from "@/server/diagnosis/rules";

/** The three PRD failures, from REAL recorded Google responses, through the real rules. */
const triggerSchema: TriggerSchema = {
  fields: [
    { key: "title", label: "Title", type: "text" },
    { key: "start", label: "Start", type: "date" },
    { key: "end", label: "End", type: "date" },
    { key: "email", label: "Email", type: "email" },
    { key: "backup_email", label: "Backup email", type: "email" },
  ],
};
const config: ActionConfig = {
  title: { kind: "mapped", source: "title" },
  start: { kind: "mapped", source: "start" },
  end: { kind: "mapped", source: "end" },
  attendee_email: { kind: "mapped", source: "email" },
};
const actionFields = googleCalendarAdapter.actions[0]!.fields;

function fixtureError(name: string) {
  const f = JSON.parse(readFileSync(`tests/fixtures/google-calendar/${name}.json`, "utf8")) as { mapped: { error: unknown } };
  return StandardErrorSchema.parse(f.mapped.error);
}

function diagnose(name: string, triggerData: Record<string, string>) {
  return classify({
    error: fixtureError(name),
    config,
    resolved: resolveConfig(config, triggerData),
    triggerSchema,
    triggerData,
    actionFields,
  });
}

describe("real Google errors reach the right rule", () => {
  it("empty attendee email: missing required field, offering the other email that has a value", () => {
    const c = diagnose("empty_attendee_email", { title: "T", start: "2030-01-15T10:00:00Z", end: "2030-01-15T11:00:00Z", email: "", backup_email: "b@example.com" });
    expect(c.category).toBe("missing_required_field");
    expect(c.supported).toBe(true);
    expect(c.candidates.map((x) => x.id)).toEqual(["map:attendee_email:backup_email"]);
  });

  it("expired connection: offers reconnect guidance without a configuration change", () => {
    const c = diagnose("invalid_token", {
      title: "T",
      start: "2030-01-15T10:00:00Z",
      end: "2030-01-15T11:00:00Z",
      email: "a@example.com",
    });
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

  it("bad date: offers only the valid interpretation of the recorded date", () => {
    const c = diagnose("invalid_date_format", {
      title: "T",
      start: "03/15/2026",
      end: "2030-01-15T11:00:00Z",
      email: "a@example.com",
    });
    expect(c.category).toBe("invalid_format");
    expect(c.candidates.map((candidate) => candidate.id)).toEqual(["transform:start:MM/DD/YYYY"]);
    expect(c.ceiling).toBe("high");
  });
});
