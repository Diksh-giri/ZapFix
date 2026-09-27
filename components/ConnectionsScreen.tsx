"use client";

import { useCallback, useEffect, useReducer } from "react";
import { ConnectionCard } from "@/components/ConnectionCard";
import type { OAuthNotice } from "@/lib/connections-page";
import { connectionsPageReducer, initialConnectionsPageState } from "@/lib/connections-page";
import { ConnectionsResponseSchema, StartConnectionResponseSchema } from "@/lib/schemas/connections";
import { PROVIDERS, type Provider } from "@/lib/types";

const LOAD_ERROR = "We could not load your connections. Check your connection and try again.";

export function ConnectionsScreen({ notice }: { notice: OAuthNotice | null }) {
  const [state, dispatch] = useReducer(connectionsPageReducer, initialConnectionsPageState);

  const loadConnections = useCallback(async () => {
    dispatch({ type: "load_started" });
    try {
      const response = await fetch("/api/connections", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("request_failed");

      const parsed = ConnectionsResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("invalid_response");
      dispatch({ type: "load_succeeded", connections: parsed.data.connections });
    } catch {
      dispatch({ type: "load_failed", message: LOAD_ERROR });
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function connect(provider: Provider) {
    dispatch({ type: "action_started", provider, action: "connect" });
    try {
      const response = await fetch(`/api/connections/${provider}/start`, { method: "POST" });
      if (!response.ok) throw new Error("request_failed");

      const parsed = StartConnectionResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("invalid_response");
      window.location.assign(parsed.data.url);
    } catch {
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

    dispatch({ type: "action_started", provider, action: "disconnect" });
    try {
      const response = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("request_failed");
      dispatch({ type: "disconnect_succeeded", provider });
    } catch {
      dispatch({ type: "action_failed", provider, message: `${providerName} could not be disconnected. Try again.` });
    }
  }

  const connectionCount = state.connections.length;
  const summary =
    connectionCount === 0
      ? "No apps are connected yet. Choose an app below to get started."
      : connectionCount === PROVIDERS.length
        ? "Google and Slack are connected."
        : "One of two apps is connected.";

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
            onClick={() => void loadConnections()}
          >
            Try again
          </button>
        </div>
      ) : null}

      {state.loadStatus === "ready" ? <p className="text-sm text-neutral-600">{summary}</p> : null}

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
