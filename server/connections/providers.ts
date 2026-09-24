import { buildAuthUrl, createGoogleClient, type GoogleConfig } from "./google";
import { requestedGoogleScopes, SLACK_BOT_SCOPES } from "./scopes";
import type { ProviderOAuth } from "./service";
import { buildSlackAuthUrl, createSlackClient, type SlackConfig } from "./slack";
import { openStaticToken, openTokens, sealStaticToken, sealTokens } from "./token-bundle";

/** Plugs the Google and Slack clients into the connections service. The clients are injectable for tests. */
export function googleProvider(
  cfg: GoogleConfig,
  client: Pick<ReturnType<typeof createGoogleClient>, "exchangeCode" | "revoke"> = createGoogleClient(cfg),
): ProviderOAuth {
  return {
    buildAuthUrl: ({ state, codeChallenge }) => buildAuthUrl(cfg, { scopes: requestedGoogleScopes(), state, codeChallenge }),
    async exchange(code, codeVerifier) {
      const { bundle, accountLabel } = await client.exchangeCode(code, codeVerifier);
      return { sealedSecret: (key) => sealTokens(bundle, key), scope: bundle.scope, accountLabel };
    },
    async revoke(secret, key) {
      try {
        await client.revoke(openTokens(secret, key).refreshToken); // revoking the refresh token also ends the access token
      } catch {
        // best effort
      }
    },
  };
}

export function slackProvider(
  cfg: SlackConfig,
  client: Pick<ReturnType<typeof createSlackClient>, "exchangeCode" | "revoke"> = createSlackClient(cfg),
): ProviderOAuth {
  return {
    buildAuthUrl: ({ state }) => buildSlackAuthUrl(cfg, { scopes: SLACK_BOT_SCOPES, state }), // Slack: state only, no PKCE
    async exchange(code) {
      const install = await client.exchangeCode(code);
      return {
        sealedSecret: (key) => sealStaticToken({ accessToken: install.accessToken, scope: install.scope }, key),
        scope: install.scope,
        accountLabel: install.accountLabel,
      };
    },
    async revoke(secret, key) {
      try {
        await client.revoke(openStaticToken(secret, key).accessToken);
      } catch {
        // best effort
      }
    },
  };
}
