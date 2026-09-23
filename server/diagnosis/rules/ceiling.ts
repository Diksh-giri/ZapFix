import type { Category, Confidence } from "@/lib/types";
import type { Candidate } from "./types";

/**
 * Decision #028: rules set the confidence ceiling from hard evidence.
 *  - unsupported, or no valid candidate  -> low   (no fix is offered)
 *  - expired connection                  -> high  (guidance only, nothing is changed)
 *  - exactly one valid candidate         -> high
 *  - several valid candidates            -> medium (the user picks from valid options)
 */
export function ceilingFor(category: Category, candidates: Candidate[]): Confidence {
  if (category === "unsupported" || candidates.length === 0) return "low";
  if (category === "expired_connection") return "high";
  return candidates.length === 1 ? "high" : "medium";
}
