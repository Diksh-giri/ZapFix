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
    expect(html).toContain("When should the event begin?");
    expect(html).toContain("Required");
    expect(html).toContain("How should ZapFix get this information?");
    expect(html).toContain("Help for When should the event begin?");
    expect(html).toContain("What this means");
    expect(html).toContain("Choose the date, starting time, and time zone for the event.");
    expect(html).toContain("October 5 at 4:00 PM, America/New York");
    expect(html).toContain("Convert date for this app");
    expect(html).toContain("Ask for it each time");
    expect(html).toContain("Use the same value every time");
    expect(html).toContain("Which answer should ZapFix use for Start?");
    expect(html).toContain("Date answer");
    expect(html).toContain("ZapFix will ask for this information before each run.");
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
    expect(html).not.toContain("Start value used every time");
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
