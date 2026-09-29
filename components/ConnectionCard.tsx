"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
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
  const googleDaysRemaining =
    provider === "google" && connection?.reconnectBy && displayState !== "reconnect_required"
      ? Math.max(0, 7 - connection.ageDays)
      : null;

  const statusText: Record<DisplayState, string> = {
    disconnected: "Disconnected",
    connected: "Connected",
    reconnect_soon: "Reconnect soon",
    reconnect_required: "Reconnect required",
  };

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]" aria-labelledby={`${provider}-connection-title`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`${provider}-connection-title`} className="font-semibold">
            {providerName}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">Status: {statusText[displayState]}</p>
        </div>
        <StatusBadge label={statusText[displayState]} tone={displayState === "connected" ? "success" : displayState === "disconnected" ? "neutral" : "warning"} />
      </div>

      {connection ? (
        <dl className="mt-4 grid gap-x-3 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
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
          {googleDaysRemaining !== null ? (
            <p>
              About {googleDaysRemaining} {googleDaysRemaining === 1 ? "day" : "days"} remaining.
            </p>
          ) : null}
          {displayState === "reconnect_soon" ? <p>Reconnect Google soon to avoid interrupting workflows.</p> : null}
          {displayState === "reconnect_required" ? <p>Reconnect Google before running workflows.</p> : null}
        </div>
      ) : null}

      {provider === "slack" && showSlackHttpsWarning ? (
        <Notice className="mt-4" tone="warning">Slack connections require HTTPS outside local development. Open the secure version of this site to connect.</Notice>
      ) : null}

      <p className="mt-2 text-sm text-neutral-600">
        Actions run on your real accounts. Use a test calendar, channel and sheet.
      </p>

      {error ? (
        <Notice className="mt-3" tone="error">{error}</Notice>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {!connection || shouldReconnect ? (
          <Button
            type="button"
            disabled={isBusy}
            onClick={onConnect}
          >
            {busyAction === "connect"
              ? "Opening connection..."
              : connection
                ? `Reconnect ${providerName}`
                : `Connect ${providerName}`}
          </Button>
        ) : null}

        {connection ? (
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={onDisconnect}
          >
            {busyAction === "disconnect" ? "Disconnecting..." : "Disconnect"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
