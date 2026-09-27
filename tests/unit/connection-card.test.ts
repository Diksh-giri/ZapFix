import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectionCard, getConnectionDisplayState } from "@/components/ConnectionCard";
import type { ClientConnection } from "@/lib/schemas/connections";

const googleConnection: ClientConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "google",
  status: "active",
  accountLabel: "tester@example.com",
  connectedAt: "2026-09-26T12:00:00.000Z",
  ageDays: 1,
  reconnectBy: "2099-10-03T12:00:00.000Z",
  lastErrorCode: null,
};

describe("getConnectionDisplayState", () => {
  const now = new Date("2026-09-26T12:00:00.000Z").getTime();

  it("distinguishes connected, nearly expired, and expired Google connections", () => {
    expect(getConnectionDisplayState(googleConnection, now)).toBe("connected");
    expect(
      getConnectionDisplayState({ ...googleConnection, reconnectBy: "2026-09-28T12:00:00.000Z" }, now),
    ).toBe("reconnect_soon");
    expect(
      getConnectionDisplayState({ ...googleConnection, reconnectBy: "2026-09-26T12:00:00.000Z" }, now),
    ).toBe("reconnect_required");
  });

  it("requires reconnection when the backend says the connection is revoked", () => {
    expect(getConnectionDisplayState({ ...googleConnection, status: "revoked" }, now)).toBe("reconnect_required");
  });
});

describe("ConnectionCard", () => {
  const actions = { onConnect: () => undefined, onDisconnect: () => undefined };

  it("guides a disconnected user to connect", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionCard, {
        provider: "slack",
        connection: null,
        busyAction: null,
        ...actions,
      }),
    );

    expect(html).toContain("Status: Disconnected");
    expect(html).toContain("Connect Slack");
    expect(html).not.toContain("Disconnecting...");
  });

  it("shows connected Google account details and the seven-day note", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionCard, {
        provider: "google",
        connection: googleConnection,
        busyAction: null,
        ...actions,
      }),
    );

    expect(html).toContain("tester@example.com");
    expect(html).toContain("Sep 26, 2026");
    expect(html).toContain("Google test connections usually last about seven days.");
    expect(html).toContain("Disconnect");
  });

  it("shows progress text, disables actions, and exposes errors as alerts", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionCard, {
        provider: "google",
        connection: { ...googleConnection, status: "needs_reconnect" },
        busyAction: "connect",
        error: "Google could not be connected. Try again.",
        ...actions,
      }),
    );

    expect(html).toContain("Reconnect required");
    expect(html).toContain("Opening connection...");
    expect(html).toContain("disabled");
    expect(html).toContain('role="alert"');
  });
});
