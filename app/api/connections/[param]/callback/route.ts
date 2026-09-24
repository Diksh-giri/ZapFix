import { AppError } from "@/lib/errors";
import { apiRoute } from "@/server/http/handler";
import { getConnectionsService, parseProvider } from "@/server/connections";
import { expiredCookie, readCookie, serializeCookie } from "@/server/connections/cookies";

export const GET = apiRoute({}, async ({ user, params, req }) => {
  const provider = parseProvider(params.param);
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (path: string, cookie: string) =>
    new Response(null, { status: 302, headers: { location: new URL(path, origin).toString(), "set-cookie": cookie } });

  try {
    const out = await getConnectionsService(origin).completeConnect(
      provider,
      user.id,
      origin,
      {
        code: url.searchParams.get("code") ?? undefined,
        state: url.searchParams.get("state") ?? undefined,
        error: url.searchParams.get("error") ?? undefined,
      },
      readCookie(req.headers.get("cookie"), `zf_oauth_${provider}`),
    );
    return back(out.redirectTo, serializeCookie(out.clearCookie));
  } catch (err) {
    if (err instanceof AppError && err.code === "validation_failed") {
      return back("/connections?error=invalid_request", serializeCookie(expiredCookie(provider, origin.startsWith("https://"))));
    }
    throw err;
  }
});
