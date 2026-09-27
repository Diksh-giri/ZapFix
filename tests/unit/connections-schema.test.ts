import { describe, expect, it } from "vitest";
import { ConnectionsResponseSchema } from "@/lib/schemas/connections";

const googleConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "google",
  status: "active",
  scopes: ["calendar.events.owned"],
  accountLabel: "tester@example.com",
  connectedAt: "2026-09-26T12:00:00.000Z",
  ageDays: 1,
  reconnectBy: "2026-10-03T12:00:00.000Z",
  lastErrorCode: null,
};

describe("ConnectionsResponseSchema", () => {
  it("accepts the connection fields the UI needs and removes scopes", () => {
    const result = ConnectionsResponseSchema.parse({ connections: [googleConnection] });

    expect(result.connections[0]).toEqual({
      id: googleConnection.id,
      provider: "google",
      status: "active",
      accountLabel: "tester@example.com",
      connectedAt: "2026-09-26T12:00:00.000Z",
      ageDays: 1,
      reconnectBy: "2026-10-03T12:00:00.000Z",
      lastErrorCode: null,
    });
    expect(result.connections[0]).not.toHaveProperty("scopes");
  });

  it("accepts an empty connection list", () => {
    expect(ConnectionsResponseSchema.parse({ connections: [] })).toEqual({ connections: [] });
  });

  it("rejects a connection with an unsupported status", () => {
    expect(() =>
      ConnectionsResponseSchema.parse({
        connections: [{ ...googleConnection, status: "mystery" }],
      }),
    ).toThrow();
  });
});
