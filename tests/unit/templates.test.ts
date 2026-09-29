import { describe, expect, it } from "vitest";
import { getAdapter } from "@/server/adapters/registry";
import { resolveConfig } from "@/server/workflows/resolve";
import { getTemplate, instantiateTemplate, WORKFLOW_TEMPLATES } from "@/server/templates";

describe("workflow templates (T27)", () => {
  it("has between 3 and 5 templates, each with a unique id", () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(WORKFLOW_TEMPLATES.length).toBeLessThanOrEqual(5);
    expect(new Set(WORKFLOW_TEMPLATES.map((t) => t.id)).size).toBe(WORKFLOW_TEMPLATES.length);
  });

  it("includes at least one deliberately broken template and at least one that works", () => {
    expect(WORKFLOW_TEMPLATES.some((t) => t.deliberatelyBroken)).toBe(true);
    expect(WORKFLOW_TEMPLATES.some((t) => !t.deliberatelyBroken)).toBe(true);
  });

  it.each(WORKFLOW_TEMPLATES)("$id: passes the real adapter's own config validation (a mapping exists for every required field)", (template) => {
    const adapter = getAdapter(template.app);
    expect(adapter.validateConfig(template.actionKey, template.actionConfig)).toEqual([]);
  });

  it.each(WORKFLOW_TEMPLATES.filter((t) => !t.deliberatelyBroken))("$id: resolves every required field to a non-empty value", (template) => {
    const adapter = getAdapter(template.app);
    const action = adapter.actions.find((a) => a.key === template.actionKey);
    const resolved = resolveConfig(template.actionConfig, {});
    for (const field of action?.fields.filter((f) => f.required) ?? []) {
      expect(resolved[field.key]).not.toBe("");
    }
  });

  it.each(WORKFLOW_TEMPLATES.filter((t) => t.deliberatelyBroken))("$id: resolves to the specific broken value its description promises", (template) => {
    const resolved = resolveConfig(template.actionConfig, {});
    if (template.id === "calendar-missing-email") expect(resolved.attendee_email).toBe("");
    if (template.id === "calendar-bad-date") expect(resolved.start).toBe("03/15/2030");
  });

  it("getTemplate finds a template by id and returns undefined for an unknown one", () => {
    expect(getTemplate("slack-valid")?.name).toBe("Post a Slack message");
    expect(getTemplate("nope")).toBeUndefined();
  });

  it("instantiateTemplate builds create() input with the caller's connection and the template's own name by default", () => {
    const template = getTemplate("calendar-valid")!;
    const input = instantiateTemplate(template, "conn-123");
    expect(input).toMatchObject({
      name: "Create a calendar event",
      app: "google_calendar",
      actionKey: "create_event",
      connectionId: "conn-123",
      actionConfig: template.actionConfig,
    });
  });

  it("instantiateTemplate accepts a custom name", () => {
    const template = getTemplate("slack-valid")!;
    const input = instantiateTemplate(template, "conn-456", "My renamed workflow");
    expect(input.name).toBe("My renamed workflow");
  });
});
