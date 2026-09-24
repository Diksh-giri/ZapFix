import { apiRoute } from "@/server/http/handler";
import { getConnectionsService, parseProvider } from "@/server/connections";
import { serializeCookie } from "@/server/connections/cookies";

export const POST = apiRoute({}, async ({ user, params, req }) => {
  const provider = parseProvider(params.param);
  const origin = new URL(req.url).origin;
  const { authUrl, cookie } = await getConnectionsService(origin).startConnect(provider, user.id, origin);
  return Response.json({ url: authUrl }, { headers: { "set-cookie": serializeCookie(cookie) } });
});
