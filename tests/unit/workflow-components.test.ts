import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FieldMapper } from "@/components/FieldMapper";
import { TriggerForm } from "@/components/TriggerForm";

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

  it("renders one correctly typed input per trigger field", () => {
    const html = renderToStaticMarkup(createElement(TriggerForm, {
      triggerSchema, onRun: vi.fn(),
    }));
    expect(html).toContain('type="text"');
    expect(html).toContain('type="date"');
    expect(html).toContain("Run test");
  });
});
