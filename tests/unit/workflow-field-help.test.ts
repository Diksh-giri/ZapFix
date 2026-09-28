import { describe, expect, it } from "vitest";
import { helpForActionField } from "@/lib/workflow-field-help";

describe("workflow field help", () => {
  it("explains Calendar fields as everyday questions with examples", () => {
    expect(helpForActionField({ key: "title", label: "Title", required: true, type: "text" }))
      .toMatchObject({ question: "What should the calendar event be called?", example: "Study group meeting" });
    expect(helpForActionField({ key: "attendee_email", label: "Attendee email", required: true, type: "email" }))
      .toMatchObject({ question: "Who should be invited?", example: "student@example.com" });
  });

  it("provides understandable fallback help for new fields", () => {
    expect(helpForActionField({ key: "custom", label: "Custom detail", required: false, type: "text" }))
      .toMatchObject({ question: "What should ZapFix use for custom detail?" });
  });
});
