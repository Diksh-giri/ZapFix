import { z } from "zod";
import { PROVIDERS } from "@/lib/types";

export const ConnectionStatusSchema = z.enum(["active", "needs_reconnect", "revoked"]);

export const ClientConnectionSchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(PROVIDERS),
  status: ConnectionStatusSchema,
  accountLabel: z.string().nullable(),
  connectedAt: z.string().datetime(),
  ageDays: z.number().int().nonnegative(),
  reconnectBy: z.string().datetime().nullable(),
});

export const ConnectionsResponseSchema = z.object({
  connections: z.array(ClientConnectionSchema),
});

export const StartConnectionResponseSchema = z.object({
  url: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "Connection URL must use HTTP or HTTPS.",
  }),
});

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type ClientConnection = z.infer<typeof ClientConnectionSchema>;
export type ConnectionsResponse = z.infer<typeof ConnectionsResponseSchema>;
