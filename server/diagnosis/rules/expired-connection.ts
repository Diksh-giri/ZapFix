import type { RuleInput, RuleMatch } from "./types";

/**
 * TODO(T13): detect an authentication failure AFTER token renewal failed.
 *  - error.category_hint === "auth"
 *  - single candidate of kind "reconnect_guidance": NO configuration change, NO approval row,
 *    the UI shows a Reconnect button. The debugger never touches credentials.
 */
export function matchExpiredConnection(_input: RuleInput): RuleMatch | null {
  return null;
}
