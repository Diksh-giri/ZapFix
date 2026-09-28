import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FieldMapper } from "@/components/FieldMapper";
import { TriggerForm } from "@/components/TriggerForm";
import { isRunnableApp } from "@/components/WorkflowsScreen";

const triggerSchema = { fields: [
  { key: "title", label: "Title", type: "text" as const },
  { key: "date", label: "Date", type: "date" as const },
] };

describe("workflow form components", () => {
  it("renders required action fields and the closed transform list", () => {
    const html = renderToStaticMarkup(createElement(FieldMapper, {
      fields: [{ key: "start", label: "Start", required: true, type: "datetime_rfc3339" }],
      triggerSchema,
      value: { start: { kind: "mapped", source: "date" } },
      onChange: vi.fn(),
    }));
    expect(html).toContain("Start (required)");
    expect(html).toContain("Date to RFC 3339");
    expect(html).toContain("Fixed value");
  });

  it("uses human date-time and time-zone controls for a fixed datetime", () => {
    const html = renderToStaticMarkup(createElement(FieldMapper, {
      fields: [{ key: "start", label: "Start", required: true, type: "datetime_rfc3339" }],
      triggerSchema,
      value: { start: { kind: "static", value: "2026-10-01T18:30:00Z", timeZone: "America/New_York" } },
      onChange: vi.fn(),
    }));
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain("Start time zone");
    expect(html).toContain('value="2026-10-01T14:30"');
    expect(html).toContain('value="America/New_York" selected=""');
    expect(html).toContain("converts this to the app&#x27;s required date format automatically");
    expect(html).not.toContain("Start fixed value");
  });

  it("renders one correctly typed input per trigger field", () => {
    const html = renderToStaticMarkup(createElement(TriggerForm, {
      triggerSchema, onRun: vi.fn(),
    }));
    expect(html).toContain('type="text"');
    expect(html).toContain('type="date"');
    expect(html).toContain("Run test");
  });

  it("disables test input and submission while edits are unsaved", () => {
    const html = renderToStaticMarkup(createElement(TriggerForm, {
      triggerSchema, disabled: true, onRun: vi.fn(),
    }));
    expect(html).toContain("<fieldset");
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("hides adapters that cannot execute yet", () => {
    const base = { provider: "google" as const, actions: [] };
    expect(isRunnableApp({ ...base, id: "google_calendar" })).toBe(true);
    expect(isRunnableApp({ ...base, id: "google_sheets" })).toBe(false);
  });
});
