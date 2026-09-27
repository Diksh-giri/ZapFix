import type { Evidence, RuleInput, RuleMatch } from "./types";

/**
 * Detects an authentication failure after the connection machinery could not provide a usable token.
 *  - error.category_hint === "auth"
 *  - single candidate of kind "reconnect_guidance": NO configuration change, NO approval row,
 *    the UI shows a Reconnect button. The debugger never touches credentials.
 */
export function matchExpiredConnection(input: RuleInput): RuleMatch | null {
  const { error } = input;
  if (error.category_hint !== "auth") return null;

  const evidence: Evidence[] = [
    { label: "App error", value: `${error.code}: ${error.message}` },
    { label: "Connection status", value: "Authentication failed" },
  ];

  return {
    category: "expired_connection",
    evidence,
    candidates: [
      {
        id: "reconnect",
        kind: "reconnect_guidance",
        description: "Reconnect the app and try again",
      },
    ],
  };
}
