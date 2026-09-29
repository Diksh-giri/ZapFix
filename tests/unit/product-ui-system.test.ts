import { createElement, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { RecoveryJourney } from "@/components/RecoveryJourney";
import { StatusBadge } from "@/components/ui/status-badge";

describe("shared product UI", () => {
  it("renders a consistent page heading and status treatment", () => {
    const html = renderToStaticMarkup(createElement(Fragment, null,
      createElement(PageHeader, { eyebrow: "Setup", title: "Connections", description: "Connect a test account." }),
      createElement(StatusBadge, { label: "Connected", tone: "success" }),
    ));
    expect(html).toContain("Connections");
    expect(html).toContain("Connect a test account.");
    expect(html).toContain("Connected");
  });

  it("labels notices without relying on color", () => {
    const html = renderToStaticMarkup(createElement(Notice, { tone: "error" }, "Try again."));
    expect(html).toContain("Error");
    expect(html).toContain("Try again.");
    expect(html).toContain('role="alert"');
  });

  it("shows all recovery steps and marks the current step", () => {
    const html = renderToStaticMarkup(createElement(RecoveryJourney, { current: "Diagnose" }));
    expect(html).toContain("Build");
    expect(html).toContain("Approve");
    expect(html).toContain("Retry or restore");
    expect(html).toContain('aria-current="step"');
  });

  it("gives destructive confirmations dialog semantics", () => {
    const html = renderToStaticMarkup(createElement(DialogPanel, {
      titleId: "title",
      descriptionId: "description",
      title: "Restore?",
      actions: createElement("button", null, "Confirm"),
    }, "This cannot undo an external action."));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-labelledby="title"');
    expect(html).toContain("This cannot undo an external action.");
  });
});
