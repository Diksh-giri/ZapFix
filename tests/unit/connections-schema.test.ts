import { describe, expect, it } from "vitest";
import { ConnectionsResponseSchema } from "@/lib/schemas/connections";

const googleConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "google",
  status: "active",
  scopes: ["calendar.events.owned"],
  lastErrorCode: "invalid_grant",
  accountLabel: "tester@example.com",
  connectedAt: "2026-09-26T12:00:00.000Z",
  ageDays: 1,
  reconnectBy: "2026-10-03T12:00:00.000Z",
};

describe("ConnectionsResponseSchema", () => {
  it("keeps only the public connection fields the UI needs", () => {
    const result = ConnectionsResponseSchema.parse({ connections: [googleConnection] });

    expect(result.connections[0]).toEqual({
      id: googleConnection.id,
      provider: "google",
      status: "active",
      accountLabel: "tester@example.com",
      connectedAt: "2026-09-26T12:00:00.000Z",
      ageDays: 1,
      reconnectBy: "2026-10-03T12:00:00.000Z",
    });
    expect(result.connections[0]).not.toHaveProperty("scopes");
    expect(result.connections[0]).not.toHaveProperty("lastErrorCode");
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
