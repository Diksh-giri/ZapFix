/**
 * Slack OAuth v2 (bot token). fetch is injected so tests never call Slack. Slack answers HTTP 200
 * even on failure, with { ok: false, error }. Bot tokens do not expire (token rotation stays off).
 * Never log a token, the code, the client secret, or Slack's raw responses.
 */
const AUTH_URL = "https://slack.com/oauth/v2/authorize";
const ACCESS_URL = "https://slack.com/api/oauth.v2.access";
const REVOKE_URL = "https://slack.com/api/auth.revoke";

export interface SlackConfig {
  clientId: string;
  clientSecret: string;
  /** Slack requires an HTTPS redirect URL that exactly matches one registered on the Slack app. */
  redirectUri: string;
}

export interface SlackInstall {
  accessToken: string;
  scope: string;
  accountLabel: string;
}

export function buildSlackAuthUrl(cfg: SlackConfig, input: { scopes: string[]; state: string }): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("scope", input.scopes.join(","));
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function createSlackClient(cfg: SlackConfig, fetchFn: typeof fetch = fetch) {
  return {
    /** Swap the one-time code for a bot token. Throws a plain Error (no secrets) on any failure. */
    async exchangeCode(code: string): Promise<SlackInstall> {
      let res: Response;
      try {
        res = await fetchFn(ACCESS_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            redirect_uri: cfg.redirectUri,
          }).toString(),
        });
      } catch {
        throw new Error("Could not reach Slack to finish connecting.");
      }
      const body = (await res.json().catch(() => undefined)) as
        | { ok?: boolean; access_token?: string; scope?: string; team?: { name?: string } }
        | undefined;
      if (!res.ok || body?.ok !== true) throw new Error("Slack did not accept the connection. Please try again.");
      if (!body.access_token) throw new Error("Slack's reply was missing a token. Please try connecting again.");
      return {
        accessToken: body.access_token,
        scope: body.scope ?? "",
        accountLabel: body.team?.name ?? "Slack workspace",
      };
    },

    /** Best effort: disconnecting must work even if Slack is unreachable or the token is already dead. */
    async revoke(token: string): Promise<void> {
      try {
        await fetchFn(REVOKE_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
      } catch {
        // ignored on purpose
      }
    },
  };
}
