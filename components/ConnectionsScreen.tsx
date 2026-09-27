"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { ConnectionCard } from "@/components/ConnectionCard";
import { disconnectConnection, loadConnections, startConnection } from "@/lib/connections-client";
import type { OAuthNotice } from "@/lib/connections-page";
import { connectionsPageReducer, getConnectionsSummary, initialConnectionsPageState } from "@/lib/connections-page";
import { PROVIDERS, type Provider } from "@/lib/types";

const LOAD_ERROR = "We could not load your connections. Check your connection and try again.";

export function ConnectionsScreen({
  notice,
  showSlackHttpsWarning,
}: {
  notice: OAuthNotice | null;
  showSlackHttpsWarning: boolean;
}) {
  const [state, dispatch] = useReducer(connectionsPageReducer, initialConnectionsPageState);
  const providersInFlight = useRef(new Set<Provider>());

  const refreshConnections = useCallback(async () => {
    dispatch({ type: "load_started" });
    try {
      dispatch({ type: "load_succeeded", connections: await loadConnections() });
    } catch {
      dispatch({ type: "load_failed", message: LOAD_ERROR });
    }
  }, []);

  useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  async function connect(provider: Provider) {
    if (providersInFlight.current.has(provider)) return;
    providersInFlight.current.add(provider);
    dispatch({ type: "action_started", provider, action: "connect" });
    try {
      window.location.assign(await startConnection(provider));
    } catch {
      providersInFlight.current.delete(provider);
      dispatch({
        type: "action_failed",
        provider,
        message: `${provider === "google" ? "Google" : "Slack"} could not be connected. Try again.`,
      });
    }
  }

  async function disconnect(provider: Provider, connectionId: string) {
    const providerName = provider === "google" ? "Google" : "Slack";
    if (!window.confirm(`Disconnect ${providerName}? Workflows using it will stop until you reconnect.`)) return;
    if (providersInFlight.current.has(provider)) return;

    providersInFlight.current.add(provider);
    dispatch({ type: "action_started", provider, action: "disconnect" });
    try {
      await disconnectConnection(connectionId);
      providersInFlight.current.delete(provider);
      dispatch({ type: "disconnect_succeeded", provider });
    } catch {
      providersInFlight.current.delete(provider);
      dispatch({ type: "action_failed", provider, message: `${providerName} could not be disconnected. Try again.` });
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Connect test accounts so ZapFix can run workflow actions on your behalf.
        </p>
      </header>

      {notice ? (
        <p
          className={`rounded border p-3 text-sm ${notice.kind === "error" ? "border-red-200 text-red-800" : "border-green-200 text-green-800"}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}

      {state.loadStatus === "loading" ? (
        <p className="text-sm text-neutral-600" role="status">
          Loading your connections...
        </p>
      ) : null}

      {state.loadStatus === "error" ? (
        <div className="rounded border border-red-200 p-4" role="alert">
          <p className="text-sm text-red-800">{state.loadError}</p>
          <button
            type="button"
            className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium"
            onClick={() => void refreshConnections()}
          >
            Try again
          </button>
        </div>
      ) : null}

      {state.loadStatus === "ready" ? (
        <p className="text-sm text-neutral-600">{getConnectionsSummary(state.connections.length)}</p>
      ) : null}

      <section className="grid gap-4" aria-label="Available connections">
        {PROVIDERS.map((provider) => {
          const connection = state.connections.find((item) => item.provider === provider) ?? null;
          return (
            <ConnectionCard
              key={provider}
              provider={provider}
              connection={connection}
              busyAction={state.busyByProvider[provider] ?? null}
              disabled={state.loadStatus !== "ready"}
              showSlackHttpsWarning={provider === "slack" && showSlackHttpsWarning}
              error={state.errorByProvider[provider] ?? null}
              onConnect={() => void connect(provider)}
              onDisconnect={() => {
                if (connection) void disconnect(provider, connection.id);
              }}
            />
          );
        })}
      </section>
    </div>
  );
}
