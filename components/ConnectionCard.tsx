"use client";

import type { ClientConnection } from "@/lib/schemas/connections";
import type { Provider } from "@/lib/types";

type BusyAction = "connect" | "disconnect" | null;
type DisplayState = "disconnected" | "connected" | "reconnect_soon" | "reconnect_required";

export interface ConnectionCardProps {
  provider: Provider;
  connection: ClientConnection | null;
  busyAction: BusyAction;
  disabled?: boolean;
  showSlackHttpsWarning?: boolean;
  error?: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

const PROVIDER_NAMES: Record<Provider, string> = {
  google: "Google",
  slack: "Slack",
};

const DAY_MS = 86_400_000;

export function getConnectionDisplayState(
  connection: ClientConnection | null,
  nowMs = Date.now(),
): DisplayState {
  if (!connection) return "disconnected";
  if (connection.status !== "active") return "reconnect_required";
  if (!connection.reconnectBy) return "connected";

  const remainingMs = new Date(connection.reconnectBy).getTime() - nowMs;
  if (remainingMs <= 0) return "reconnect_required";
  if (remainingMs <= 2 * DAY_MS) return "reconnect_soon";
  return "connected";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ConnectionCard({
  provider,
  connection,
  busyAction,
  disabled = false,
  showSlackHttpsWarning = false,
  error,
  onConnect,
  onDisconnect,
}: ConnectionCardProps) {
  const providerName = PROVIDER_NAMES[provider];
  const displayState = getConnectionDisplayState(connection);
  const isBusy = disabled || busyAction !== null;
  const shouldReconnect = displayState === "reconnect_soon" || displayState === "reconnect_required";

  const statusText: Record<DisplayState, string> = {
    disconnected: "Disconnected",
    connected: "Connected",
    reconnect_soon: "Reconnect soon",
    reconnect_required: "Reconnect required",
  };

  return (
    <article className="rounded-lg border border-neutral-200 p-5" aria-labelledby={`${provider}-connection-title`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`${provider}-connection-title`} className="font-semibold">
            {providerName}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">Status: {statusText[displayState]}</p>
        </div>
        <span className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium">
          {statusText[displayState]}
        </span>
      </div>

      {connection ? (
        <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-neutral-600">Account</dt>
          <dd>{connection.accountLabel ?? "Account label unavailable"}</dd>
          <dt className="text-neutral-600">Connected</dt>
          <dd>{formatDate(connection.connectedAt)}</dd>
          {provider === "google" && connection.reconnectBy ? (
            <>
              <dt className="text-neutral-600">Reconnect by</dt>
              <dd>{formatDate(connection.reconnectBy)}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-neutral-600">
          Connect {providerName} to use it in a workflow.
        </p>
      )}

      {provider === "google" ? (
        <div className="mt-4 space-y-1 text-sm text-neutral-600">
          <p>Google test connections usually last about seven days.</p>
          {displayState === "reconnect_soon" ? <p>Reconnect Google soon to avoid interrupting workflows.</p> : null}
          {displayState === "reconnect_required" ? <p>Reconnect Google before running workflows.</p> : null}
        </div>
      ) : null}

      {provider === "slack" && showSlackHttpsWarning ? (
        <p className="mt-4 text-sm font-medium text-amber-800" role="note">
          Slack connections require HTTPS outside local development. Open the secure version of this site to connect.
        </p>
      ) : null}

      <p className="mt-2 text-sm text-neutral-600">
        Actions run on your real accounts. Use test accounts and test data.
      </p>

      {error ? (
        <p className="mt-3 text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {!connection || shouldReconnect ? (
          <button
            type="button"
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy}
            onClick={onConnect}
          >
            {busyAction === "connect"
              ? "Opening connection..."
              : connection
                ? `Reconnect ${providerName}`
                : `Connect ${providerName}`}
          </button>
        ) : null}

        {connection ? (
          <button
            type="button"
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy}
            onClick={onDisconnect}
          >
            {busyAction === "disconnect" ? "Disconnecting..." : "Disconnect"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
