/** Shared vocabulary. These match the CHECK constraints in db/schema. */

export const CATEGORIES = [
  "missing_required_field",
  "invalid_format",
  "expired_connection",
  "unsupported",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const; // ascending
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const ATTEMPT_STATUSES = ["running", "succeeded", "failed", "uncertain"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const PROPOSAL_KINDS = ["config_change", "reconnect_guidance"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROVIDERS = ["google", "slack"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Apps (adapters) the MVP supports. Build order: Calendar, Slack, Sheets (Decision #034). */
export const APP_IDS = ["google_calendar", "slack", "google_sheets", "gmail", "google_drive"] as const;
export type AppId = (typeof APP_IDS)[number];

export function confidenceRank(c: Confidence): number {
  return CONFIDENCE_LEVELS.indexOf(c);
}
