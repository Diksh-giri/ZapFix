import "server-only";
import { db } from "@/db/client";
import { auditStore } from "@/server/audit";
import { createAnthropicClient, aiTimeoutMs } from "./ai/client";
import { getProposalStore } from "@/server/proposals";
import { createDrizzleDiagnosisStore } from "./drizzle-store";
import { e2eFixtureModeEnabled } from "@/server/e2e-fixture-mode";
// T29: no live AI calls in e2e mode either -- see tests/e2e/support/fixture-ai-client.ts. No
// side effect at import time; only used when E2E_FIXTURE_ADAPTERS=1.
import { fixtureAiClient } from "../../tests/e2e/support/fixture-ai-client";

/** Wires T13 diagnosis persistence to the real database. */
export const getDiagnosisStore = () => createDrizzleDiagnosisStore(db);

/** Production dependencies for the T13 diagnosis service. Tests inject small fakes instead. */
export const diagnosisDeps = () => ({
  store: getDiagnosisStore(),
  proposals: getProposalStore(),
  audit: auditStore(),
  aiClient: e2eFixtureModeEnabled() ? fixtureAiClient : createAnthropicClient(),
  now: () => new Date(),
  timeoutMs: aiTimeoutMs(),
  model: process.env.AI_MODEL?.trim() || null,
});
