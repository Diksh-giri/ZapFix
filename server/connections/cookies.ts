import type { CookieToSet } from "./service";

export function serializeCookie(c: CookieToSet): string {
  const parts = [`${c.name}=${c.value}`, `Path=${c.options.path}`, `Max-Age=${c.options.maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (c.options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || undefined;
  }
  return undefined;
}

/** A cookie that tells the browser to delete the connect-flow cookie. */
export function expiredCookie(provider: string, secure: boolean): CookieToSet {
  return {
    name: `zf_oauth_${provider}`,
    value: "",
    options: { httpOnly: true, sameSite: "lax", path: "/api/connections", maxAge: 0, secure },
  };
}
