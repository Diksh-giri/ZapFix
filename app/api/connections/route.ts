import { apiRoute } from "@/server/http/handler";
import { getConnectionsService } from "@/server/connections";

export const GET = apiRoute({}, async ({ user, req }) => {
  const connections = await getConnectionsService(new URL(req.url).origin).listConnections(user.id);
  return { connections };
});
