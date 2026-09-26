import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { activateInvite } from "@/server/access/invite";
import { safeNextPath } from "@/server/access/redirects";

type PendingCookie = { name: string; value: string; options: CookieOptions };

function redirectTo(req: Request, path: string, cookies: Map<string, PendingCookie>): NextResponse {
  const response = NextResponse.redirect(new URL(path, req.url));
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export async function GET(req: Request): Promise<Response> {
  const requestUrl = new URL(req.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pendingCookies = new Map<string, PendingCookie>();

  if (!url || !anon || !tokenHash || (type !== "email" && type !== "magiclink")) {
    return redirectTo(req, "/sign-in?status=invalid_link", pendingCookies);
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => [],
      setAll: (list) => list.forEach((cookie) => pendingCookies.set(cookie.name, cookie)),
    },
  });
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
  const email = data.user?.email;
  if (error || !email) return redirectTo(req, "/sign-in?status=invalid_link", pendingCookies);

  if (!(await activateInvite(email))) {
    await supabase.auth.signOut();
    return redirectTo(req, "/sign-in?status=not_invited", pendingCookies);
  }

  return redirectTo(req, next, pendingCookies);
}
