import { ConnectionsResponseSchema, StartConnectionResponseSchema } from "@/lib/schemas/connections";
import type { ClientConnection } from "@/lib/schemas/connections";
import type { Provider } from "@/lib/types";

export type FetchConnectionRequest = (input: string, init?: RequestInit) => Promise<Response>;

export async function loadConnections(fetchRequest: FetchConnectionRequest = fetch): Promise<ClientConnection[]> {
  const response = await fetchRequest("/api/connections", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("request_failed");

  const parsed = ConnectionsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("invalid_response");
  return parsed.data.connections;
}

export async function startConnection(
  provider: Provider,
  fetchRequest: FetchConnectionRequest = fetch,
): Promise<string> {
  const response = await fetchRequest(`/api/connections/${provider}/start`, { method: "POST" });
  if (!response.ok) throw new Error("request_failed");

  const parsed = StartConnectionResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("invalid_response");
  return parsed.data.url;
}

export async function disconnectConnection(
  connectionId: string,
  fetchRequest: FetchConnectionRequest = fetch,
): Promise<void> {
  const response = await fetchRequest(`/api/connections/${connectionId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("request_failed");
}
