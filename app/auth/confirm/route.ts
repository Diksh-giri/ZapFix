import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { parseAuthCallback } from "@/server/access/auth-callback";
import { activateInvite } from "@/server/access/invite";
import { safeNextPath } from "@/server/access/redirects";

type PendingCookie = { name: string; value: string; options: CookieOptions };

function redirectTo(req: Request, path: string, cookies: Map<string, PendingCookie>): NextResponse {
  const response = NextResponse.redirect(new URL(path, req.url));
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestUrl = new URL(req.url);
  const authCallback = parseAuthCallback(requestUrl.searchParams);
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pendingCookies = new Map<string, PendingCookie>();

  if (!url || !anon || !authCallback) {
    return redirectTo(req, "/sign-in?status=invalid_link", pendingCookies);
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => list.forEach((cookie) => pendingCookies.set(cookie.name, cookie)),
    },
  });
  let authResult;
  if (authCallback.kind === "code") {
    authResult = await supabase.auth.exchangeCodeForSession(authCallback.code);
  } else {
    authResult = await supabase.auth.verifyOtp({ token_hash: authCallback.tokenHash, type: authCallback.type });
  }

  const { data, error } = authResult;
  const email = data.user?.email;
  if (error || !email) return redirectTo(req, "/sign-in?status=invalid_link", pendingCookies);

  if (!(await activateInvite(email))) {
    await supabase.auth.signOut();
    return redirectTo(req, "/sign-in?status=not_invited", pendingCookies);
  }

  return redirectTo(req, next, pendingCookies);
}
