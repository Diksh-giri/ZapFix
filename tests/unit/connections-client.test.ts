import { describe, expect, it, vi } from "vitest";
import {
  disconnectConnection,
  loadConnections,
  startConnection,
  type FetchConnectionRequest,
} from "@/lib/connections-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("connections client", () => {
  it("loads and validates the connection list with GET", async () => {
    const fetchRequest = vi.fn<FetchConnectionRequest>().mockResolvedValue(jsonResponse({ connections: [] }));

    await expect(loadConnections(fetchRequest)).resolves.toEqual([]);
    expect(fetchRequest).toHaveBeenCalledWith("/api/connections", {
      headers: { accept: "application/json" },
    });
  });

  it("starts OAuth with POST and returns the authorization URL", async () => {
    const fetchRequest = vi
      .fn<FetchConnectionRequest>()
      .mockResolvedValue(jsonResponse({ url: "https://accounts.google.com/o/oauth2/auth" }));

    await expect(startConnection("google", fetchRequest)).resolves.toBe(
      "https://accounts.google.com/o/oauth2/auth",
    );
    expect(fetchRequest).toHaveBeenCalledWith("/api/connections/google/start", { method: "POST" });
  });

  it("disconnects the selected connection with DELETE", async () => {
    const fetchRequest = vi.fn<FetchConnectionRequest>().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      disconnectConnection("11111111-1111-4111-8111-111111111111", fetchRequest),
    ).resolves.toBeUndefined();
    expect(fetchRequest).toHaveBeenCalledWith(
      "/api/connections/11111111-1111-4111-8111-111111111111",
      { method: "DELETE" },
    );
  });

  it("rejects failed requests and invalid response data", async () => {
    const failedRequest = vi.fn<FetchConnectionRequest>().mockResolvedValue(jsonResponse({}, 500));
    const invalidResponse = vi.fn<FetchConnectionRequest>().mockResolvedValue(jsonResponse({ connections: "no" }));
    const unsafeRedirect = vi.fn<FetchConnectionRequest>().mockResolvedValue(jsonResponse({ url: "javascript:alert(1)" }));

    await expect(loadConnections(failedRequest)).rejects.toThrow("request_failed");
    await expect(loadConnections(invalidResponse)).rejects.toThrow("invalid_response");
    await expect(startConnection("slack", unsafeRedirect)).rejects.toThrow("invalid_response");
  });

  it("rejects failed OAuth start and disconnect requests", async () => {
    const failedStart = vi.fn<FetchConnectionRequest>().mockResolvedValue(jsonResponse({}, 503));
    const failedDisconnect = vi.fn<FetchConnectionRequest>().mockResolvedValue(jsonResponse({}, 500));

    await expect(startConnection("google", failedStart)).rejects.toThrow("request_failed");
    await expect(
      disconnectConnection("11111111-1111-4111-8111-111111111111", failedDisconnect),
    ).rejects.toThrow("request_failed");
  });
});
