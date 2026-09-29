import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/workflows/workflow-1" }));

import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/Dashboard";
import type { ClientConnection } from "@/lib/schemas/connections";
import type { Workflow } from "@/lib/schemas/workflows";

const workflow: Workflow = {
  id: "10000000-0000-4000-8000-000000000001",
  userId: "10000000-0000-4000-8000-000000000002",
  name: "Calendar recovery",
  app: "google_calendar",
  actionKey: "create_event",
  connectionId: "10000000-0000-4000-8000-000000000003",
  triggerSchema: { fields: [] },
  actionConfig: {},
  configVersion: 2,
  lastModifiedBy: "user",
  createdAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T12:00:00.000Z",
};

const connection: ClientConnection = {
  id: "10000000-0000-4000-8000-000000000004",
  provider: "google",
  status: "active",
  accountLabel: "Test Google",
  connectedAt: "2026-09-29T12:00:00.000Z",
  ageDays: 0,
  reconnectBy: "2026-10-06T12:00:00.000Z",
};

describe("product shell", () => {
  it("renders primary navigation, account state, and the active section", () => {
    const html = renderToStaticMarkup(createElement(AppShell, { userEmail: "tester@example.com" }, createElement("p", null, "Page content")));
    expect(html).toContain("ZapFix");
    expect(html).toContain("Workflow recovery");
    expect(html).toContain("tester@example.com");
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/workflows"/);
    expect(html).toContain("Skip to main content");
    expect(html).toContain('aria-controls="mobile-navigation"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("Page content");
  });

  it("renders useful workspace totals and recent workflows", () => {
    const html = renderToStaticMarkup(createElement(DashboardView, { workflows: [workflow], connections: [connection] }));
    expect(html).toContain("Your workspace");
    expect(html).toContain("Active connections");
    expect(html).toContain("Calendar recovery");
    expect(html).toContain("google calendar");
    expect(html).toContain("Version 2");
    expect(html).toContain("Google");
  });

  it("gives a clear first action when the workspace is empty", () => {
    const html = renderToStaticMarkup(createElement(DashboardView, { workflows: [], connections: [] }));
    expect(html).toContain("No workflows yet");
    expect(html).toContain("Create your first workflow");
    expect(html).toContain("Connect an app to begin");
  });
});
