import { readFileSync } from "node:fs";
import path from "node:path";
import type { AiClient } from "@/server/diagnosis/ai/client";

/**
 * Stands in for the real Anthropic client in e2e mode (T29: no live calls). Always answers with
 * the same recorded, already-validated reply used by T24's eval set for the scenario the
 * e2e Calendar spec seeds (an empty attendee_email with "contact_email" as the default option) --
 * so diagnosis genuinely proposes map:attendee_email:contact_email, the same candidate id
 * classify() produces for that seeded workflow, and the "approve" step has something real to approve.
 */
const RECORDING = path.join(__dirname, "..", "..", "..", "evals", "ai-recordings", "calendar-empty-attendee-email-one-alternative.txt");

export const fixtureAiClient: AiClient = {
  async complete() {
    return readFileSync(RECORDING, "utf8");
  },
};
