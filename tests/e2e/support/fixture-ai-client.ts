import { readFileSync } from "node:fs";
import path from "node:path";
import type { AiClient } from "@/server/diagnosis/ai/client";

/**
 * Stands in for the real Anthropic client in e2e mode (T29: no live calls). The payload's
 * candidate list (never raw values -- Decision #018) is enough to tell which seeded scenario is
 * being diagnosed, so this answers with the matching recorded, already-validated reply instead of
 * one fixed answer -- each recording's `selected_candidate_id` must be a real candidate id for
 * that scenario, or diagnosis would reject it as off-list.
 */
// process.cwd(), not __dirname: this module is imported by server/diagnosis/index.ts, which
// Next.js bundles into its own server build -- __dirname there points into that build's output,
// not this source file's real location. The dev server's cwd is reliably the project root.
const RECORDINGS_DIR = path.join(process.cwd(), "evals", "ai-recordings");

// Order matters: "map:attendee_email:contact_email" is present in BOTH the one- and
// two-candidate Calendar scenarios (work_email being present as a candidate is what distinguishes
// them), so the more specific two-candidate marker must be checked first.
const SCENARIOS: Array<{ marker: string; file: string }> = [
  { marker: "map:attendee_email:work_email", file: "calendar-empty-attendee-email-two-alternatives.txt" },
  { marker: "map:attendee_email:contact_email", file: "calendar-empty-attendee-email-one-alternative.txt" },
  { marker: "map:channel:backup_channel", file: "slack-empty-channel-one-alternative.txt" },
];

export const fixtureAiClient: AiClient = {
  async complete(input) {
    const scenario = SCENARIOS.find((s) => input.user.includes(s.marker));
    if (!scenario) throw new Error("fixtureAiClient: no recording matches this diagnosis payload's candidates");
    return readFileSync(path.join(RECORDINGS_DIR, scenario.file), "utf8");
  },
};
