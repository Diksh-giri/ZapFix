import type { EmailOtpType } from "@supabase/supabase-js";

export type AuthCallback =
  | { kind: "code"; code: string }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType };

/** Accepts Supabase's default PKCE callback and customized token-hash email templates. */
export function parseAuthCallback(searchParams: URLSearchParams): AuthCallback | null {
  const code = searchParams.get("code");
  if (code) return { kind: "code", code };

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (tokenHash && (type === "email" || type === "magiclink")) {
    return { kind: "otp", tokenHash, type };
  }

  return null;
}
