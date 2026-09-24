import { TokenRefreshError } from "./access-token";
import { bundleFromTokenResponse, type TokenBundle } from "./token-bundle";

/**
 * Google OAuth endpoints (web-server flow). fetch is injected so tests never call Google.
 * Never log a token, an authorization code, the client secret, or Google's raw responses.
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildAuthUrl(
  cfg: GoogleConfig,
  input: { scopes: string[]; state: string; codeChallenge: string },
): string {
  const url = new URL(AUTH_URL);
  const p = url.searchParams;
  p.set("client_id", cfg.clientId);
  p.set("redirect_uri", cfg.redirectUri);
  p.set("response_type", "code");
  p.set("scope", input.scopes.join(" "));
  p.set("access_type", "offline");
  p.set("prompt", "consent"); // makes Google return a refresh token every time
  p.set("state", input.state);
  p.set("code_challenge", input.codeChallenge);
  p.set("code_challenge_method", "S256");
  return url.toString();
}

export function createGoogleClient(
  cfg: GoogleConfig,
  fetchFn: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  const post = (url: string, params: Record<string, string>) =>
    fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });

  return {
    /** Swap the one-time code for tokens. Throws a plain Error (no secrets) on any failure. */
    async exchangeCode(code: string, codeVerifier: string): Promise<{ bundle: TokenBundle; accountLabel: string | null }> {
      let res: Response;
      try {
        res = await post(TOKEN_URL, {
          grant_type: "authorization_code",
          code,
          code_verifier: codeVerifier,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
        });
      } catch {
        throw new Error("Could not reach Google to finish connecting.");
      }
      const body: unknown = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(`Google did not accept the connection (HTTP ${res.status}).`);
      try {
        return { bundle: bundleFromTokenResponse(body, now()), accountLabel: emailFromIdToken(body) };
      } catch {
        throw new Error("Google's reply was missing a token. Please try connecting again.");
      }
    },

    /** Renew an access token. Returns Google's raw response; throws TokenRefreshError. */
    async refresh(refreshToken: string): Promise<unknown> {
      let res: Response;
      try {
        res = await post(TOKEN_URL, {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
        });
      } catch {
        throw new TokenRefreshError("temporary");
      }
      const body = (await res.json().catch(() => undefined)) as { error?: string } | undefined;
      if (res.ok) return body;
      throw new TokenRefreshError(res.status === 400 && body?.error === "invalid_grant" ? "invalid_grant" : "temporary");
    },

    /** Best effort: disconnecting must work even if Google is unreachable or the token is already dead. */
    async revoke(token: string): Promise<void> {
      try {
        await post(REVOKE_URL, { token });
      } catch {
        // ignored on purpose
      }
    },
  };
}

/**
 * The account email, read from the sign-in token Google returns in the same response. It is only
 * used as a display label, so it is decoded but not stored, and any problem just means "no label".
 */
function emailFromIdToken(response: unknown): string | null {
  try {
    const idToken = (response as { id_token?: unknown }).id_token;
    if (typeof idToken !== "string") return null;
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
