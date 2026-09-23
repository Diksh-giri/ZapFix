import type { Classification, RuleInput, RuleMatch } from "./types";
import { ceilingFor } from "./ceiling";
import { matchMissingRequiredField } from "./missing-required-field";
import { matchInvalidFormat } from "./invalid-format";
import { matchExpiredConnection } from "./expired-connection";

const RULES: Array<(input: RuleInput) => RuleMatch | null> = [
  matchExpiredConnection,
  matchMissingRequiredField,
  matchInvalidFormat,
];

/** First matching rule wins. No match = "unsupported": safe outcome, no fix offered. */
export function classify(input: RuleInput): Classification {
  for (const rule of RULES) {
    const match = rule(input);
    if (match) {
      return {
        category: match.category,
        supported: true,
        evidence: match.evidence,
        candidates: match.candidates,
        ceiling: ceilingFor(match.category, match.candidates),
      };
    }
  }
  return {
    category: "unsupported",
    supported: false,
    evidence: [{ label: "App error", value: `${input.error.code}: ${input.error.message}` }],
    candidates: [],
    ceiling: "low",
  };
}
