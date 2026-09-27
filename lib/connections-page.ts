import type { ClientConnection } from "@/lib/schemas/connections";
import type { Provider } from "@/lib/types";

export type BusyAction = "connect" | "disconnect";
export type LoadStatus = "loading" | "ready" | "error";

export interface ConnectionsPageState {
  loadStatus: LoadStatus;
  connections: ClientConnection[];
  loadError: string | null;
  busyByProvider: Partial<Record<Provider, BusyAction>>;
  errorByProvider: Partial<Record<Provider, string>>;
}

export type ConnectionsPageEvent =
  | { type: "load_started" }
  | { type: "load_succeeded"; connections: ClientConnection[] }
  | { type: "load_failed"; message: string }
  | { type: "action_started"; provider: Provider; action: BusyAction }
  | { type: "action_failed"; provider: Provider; message: string }
  | { type: "disconnect_succeeded"; provider: Provider };

export const initialConnectionsPageState: ConnectionsPageState = {
  loadStatus: "loading",
  connections: [],
  loadError: null,
  busyByProvider: {},
  errorByProvider: {},
};

function withoutProvider<T>(record: Partial<Record<Provider, T>>, provider: Provider) {
  const next = { ...record };
  delete next[provider];
  return next;
}

export function connectionsPageReducer(
  state: ConnectionsPageState,
  event: ConnectionsPageEvent,
): ConnectionsPageState {
  switch (event.type) {
    case "load_started":
      return { ...state, loadStatus: "loading", loadError: null };
    case "load_succeeded":
      return { ...state, loadStatus: "ready", connections: event.connections, loadError: null };
    case "load_failed":
      return { ...state, loadStatus: "error", loadError: event.message };
    case "action_started":
      return {
        ...state,
        busyByProvider: { ...state.busyByProvider, [event.provider]: event.action },
        errorByProvider: withoutProvider(state.errorByProvider, event.provider),
      };
    case "action_failed":
      return {
        ...state,
        busyByProvider: withoutProvider(state.busyByProvider, event.provider),
        errorByProvider: { ...state.errorByProvider, [event.provider]: event.message },
      };
    case "disconnect_succeeded":
      return {
        ...state,
        connections: state.connections.filter((connection) => connection.provider !== event.provider),
        busyByProvider: withoutProvider(state.busyByProvider, event.provider),
        errorByProvider: withoutProvider(state.errorByProvider, event.provider),
      };
  }
}

export interface OAuthNotice {
  kind: "success" | "error";
  message: string;
}

export function getOAuthNotice(params: { connected?: string; error?: string }): OAuthNotice | null {
  if (params.connected === "google") return { kind: "success", message: "Google connected successfully." };
  if (params.connected === "slack") return { kind: "success", message: "Slack connected successfully." };

  switch (params.error) {
    case "access_denied":
      return { kind: "error", message: "Connection canceled. No account changes were made." };
    case "connect_failed":
      return { kind: "error", message: "The connection could not be completed. Please try again." };
    case "invalid_request":
      return { kind: "error", message: "This connection request expired or was invalid. Please start again." };
    default:
      return null;
  }
}

export function shouldShowSlackHttpsWarning(location: { protocol: string; hostname: string }): boolean {
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return location.protocol !== "https:" && !isLocal;
}
