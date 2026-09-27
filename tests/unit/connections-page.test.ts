import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectionsScreen } from "@/components/ConnectionsScreen";
import {
  connectionsPageReducer,
  getOAuthNotice,
  initialConnectionsPageState,
  shouldShowSlackHttpsWarning,
} from "@/lib/connections-page";
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

describe("connectionsPageReducer", () => {
  it("moves from loading to a successful empty state", () => {
    const state = connectionsPageReducer(initialConnectionsPageState, {
      type: "load_succeeded",
      connections: [],
    });

    expect(state.loadStatus).toBe("ready");
    expect(state.connections).toEqual([]);
    expect(state.loadError).toBeNull();
  });

  it("moves from loading to a fetch failure and can retry", () => {
    const failed = connectionsPageReducer(initialConnectionsPageState, {
      type: "load_failed",
      message: "Could not load.",
    });
    const retrying = connectionsPageReducer(failed, { type: "load_started" });

    expect(failed).toMatchObject({ loadStatus: "error", loadError: "Could not load." });
    expect(retrying).toMatchObject({ loadStatus: "loading", loadError: null });
  });

  it("tracks an action failure for only the affected provider", () => {
    const ready = connectionsPageReducer(initialConnectionsPageState, {
      type: "load_succeeded",
      connections: [googleConnection],
    });
    const busy = connectionsPageReducer(ready, {
      type: "action_started",
      provider: "google",
      action: "disconnect",
    });
    const failed = connectionsPageReducer(busy, {
      type: "action_failed",
      provider: "google",
      message: "Could not disconnect.",
    });

    expect(busy.busyByProvider.google).toBe("disconnect");
    expect(failed.busyByProvider.google).toBeUndefined();
    expect(failed.errorByProvider.google).toBe("Could not disconnect.");
  });

  it("removes the disconnected provider without changing other connections", () => {
    const slackConnection: ClientConnection = {
      ...googleConnection,
      id: "22222222-2222-4222-8222-222222222222",
      provider: "slack",
      accountLabel: "Test workspace",
      reconnectBy: null,
    };
    const ready = connectionsPageReducer(initialConnectionsPageState, {
      type: "load_succeeded",
      connections: [googleConnection, slackConnection],
    });
    const disconnected = connectionsPageReducer(ready, {
      type: "disconnect_succeeded",
      provider: "google",
    });

    expect(disconnected.connections).toEqual([slackConnection]);
  });
});

describe("getOAuthNotice", () => {
  it("maps successful Google and Slack callbacks to friendly messages", () => {
    expect(getOAuthNotice({ connected: "google" })).toEqual({
      kind: "success",
      message: "Google connected successfully.",
    });
    expect(getOAuthNotice({ connected: "slack" })?.kind).toBe("success");
  });

  it("maps cancellation and callback failures without exposing provider details", () => {
    expect(getOAuthNotice({ error: "access_denied" })?.message).toContain("canceled");
    expect(getOAuthNotice({ error: "connect_failed" })?.message).toContain("could not be completed");
    expect(getOAuthNotice({ error: "unknown" })).toBeNull();
  });
});

describe("ConnectionsScreen", () => {
  it("renders the initial loading state and both provider cards", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionsScreen, { notice: null, showSlackHttpsWarning: false }),
    );

    expect(html).toContain("Loading your connections...");
    expect(html).toContain("Google");
    expect(html).toContain("Slack");
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("shouldShowSlackHttpsWarning", () => {
  it("stays quiet on local HTTP and every HTTPS deployment", () => {
    expect(shouldShowSlackHttpsWarning({ protocol: "http:", hostname: "localhost" })).toBe(false);
    expect(shouldShowSlackHttpsWarning({ protocol: "http:", hostname: "127.0.0.1" })).toBe(false);
    expect(shouldShowSlackHttpsWarning({ protocol: "https:", hostname: "zapfix.example" })).toBe(false);
  });

  it("warns on an insecure non-local deployment", () => {
    expect(shouldShowSlackHttpsWarning({ protocol: "http:", hostname: "zapfix.example" })).toBe(true);
  });
});
