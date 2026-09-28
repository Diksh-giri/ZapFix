import "server-only";
import { db } from "@/db/client";
import { auditStore } from "@/server/audit";
import { createAnthropicClient, aiTimeoutMs } from "./ai/client";
import { getProposalStore } from "@/server/proposals";
import { createDrizzleDiagnosisStore } from "./drizzle-store";

/** Wires T13 diagnosis persistence to the real database. */
export const getDiagnosisStore = () => createDrizzleDiagnosisStore(db);

/** Production dependencies for the T13 diagnosis service. Tests inject small fakes instead. */
export const diagnosisDeps = () => ({
  store: getDiagnosisStore(),
  proposals: getProposalStore(),
  audit: auditStore(),
  aiClient: createAnthropicClient(),
  now: () => new Date(),
  timeoutMs: aiTimeoutMs(),
  model: process.env.AI_MODEL?.trim() || null,
});
