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

  it("maps every backend connection status to a display state", () => {
    expect(getConnectionDisplayState({ ...googleConnection, status: "active" }, now)).toBe("connected");
    expect(getConnectionDisplayState({ ...googleConnection, status: "needs_reconnect" }, now)).toBe(
      "reconnect_required",
    );
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
    expect(html).toContain("About 6 days remaining.");
    expect(html).toContain("Actions run on your real accounts. Use a test calendar, channel and sheet.");
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

  it("disables connect while the parent page is loading", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionCard, {
        provider: "slack",
        connection: null,
        busyAction: null,
        disabled: true,
        ...actions,
      }),
    );

    expect(html).toContain("Connect Slack");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Opening connection...");
  });

  it("shows the Slack HTTPS warning only when the page says it is actionable", () => {
    const localHtml = renderToStaticMarkup(
      createElement(ConnectionCard, {
        provider: "slack",
        connection: null,
        busyAction: null,
        ...actions,
      }),
    );
    const insecureDeploymentHtml = renderToStaticMarkup(
      createElement(ConnectionCard, {
        provider: "slack",
        connection: null,
        busyAction: null,
        showSlackHttpsWarning: true,
        ...actions,
      }),
    );

    expect(localHtml).not.toContain("Slack connections require HTTPS");
    expect(insecureDeploymentHtml).toContain("Slack connections require HTTPS outside local development.");
  });

  it("does not show Google expiration guidance for Slack", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionCard, {
        provider: "slack",
        connection: {
          ...googleConnection,
          id: "22222222-2222-4222-8222-222222222222",
          provider: "slack",
          accountLabel: "Test workspace",
          reconnectBy: null,
        },
        busyAction: null,
        ...actions,
      }),
    );

    expect(html).toContain("Test workspace");
    expect(html).not.toContain("seven days");
    expect(html).not.toContain("Reconnect by");
  });

  it("never renders internal scopes or provider error codes", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionCard, {
        provider: "google",
        connection: { ...googleConnection, lastErrorCode: "secret_provider_error" },
        busyAction: null,
        ...actions,
      }),
    );

    expect(html).not.toContain("calendar.events.owned");
    expect(html).not.toContain("secret_provider_error");
  });
});
