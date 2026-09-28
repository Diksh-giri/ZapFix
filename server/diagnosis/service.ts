import { AppError } from "@/lib/errors";
import { getAdapter } from "@/server/adapters/registry";
import type { AppAdapter } from "@/server/adapters/types";
import { checkRateLimit, recordEvent } from "@/server/audit/events";
import type { AuditStore } from "@/server/audit/store";
import { createProposal } from "@/server/proposals/create";
import type { ProposalStore } from "@/server/proposals/store";
import type { DiagnosisInput } from "@/server/proposals/types";
import { buildProposalView, type ProposalView } from "@/server/proposals/view";
import { assertCanDiagnose } from "@/server/runs/engine";
import { resolveConfig } from "@/server/workflows/resolve";
import type { AiClient } from "./ai/client";
import { explainWithAi, toDiagnosisAi } from "./ai/explain";
import { buildAiPayload, maskQuotedValues } from "./ai/payload";
import { classify } from "./rules";
import type { DiagnosisRecord, DiagnosisStore } from "./store";

export interface DiagnosisServiceDeps {
  store: DiagnosisStore;
  proposals: ProposalStore;
  audit: AuditStore;
  aiClient: AiClient;
  adapterFor?: (app: Parameters<typeof getAdapter>[0]) => AppAdapter;
  now: () => Date;
  timeoutMs: number;
  model: string | null;
}

export interface DiagnosisResult {
  diagnosis: DiagnosisRecord;
  proposal: ProposalView | null;
}

export async function diagnoseRun(
  deps: DiagnosisServiceDeps,
  input: { runId: string; userId: string },
): Promise<DiagnosisResult> {
  const context = await deps.store.getContext(input.runId, input.userId);
  if (!context) throw new AppError("not_found", "That failed run was not found.");

  try {
    assertCanDiagnose(context.run.repairCount);
  } catch (error) {
    if (error instanceof AppError && error.code === "repair_limit_reached") {
      await recordEvent(deps.audit, {
        userId: input.userId,
        runId: input.runId,
        type: "repair_limit_reached",
      }).catch(() => {});
    }
    throw error;
  }

  await checkRateLimit({ store: deps.audit, now: deps.now }, input.userId, "diagnoses");
  await recordEvent(deps.audit, { userId: input.userId, runId: input.runId, type: "diagnosis_requested" });

  const adapter = (deps.adapterFor ?? getAdapter)(context.workflow.app);
  const action = adapter.actions.find((candidate) => candidate.key === context.workflow.actionKey);
  if (!action || !context.attempt.error) {
    throw new AppError("internal", "This failed run does not contain the information needed for diagnosis.");
  }

  const resolved = resolveConfig(context.attempt.configSnapshot, context.run.triggerData);
  const classification = classify({
    error: context.attempt.error,
    config: context.attempt.configSnapshot,
    resolved,
    triggerSchema: context.workflow.triggerSchema,
    triggerData: context.run.triggerData,
    actionFields: action.fields,
  });
  const payload = buildAiPayload({
    category: classification.category,
    error: context.attempt.error,
    config: context.attempt.configSnapshot,
    resolved,
    candidates: classification.candidates,
  });
  const ai = toDiagnosisAi(
    await explainWithAi({
      client: deps.aiClient,
      payload,
      ceiling: classification.ceiling,
      timeoutMs: deps.timeoutMs,
    }),
  );

  const diagnosis = await deps.store.insert(input.userId, {
    attemptId: context.attempt.id,
    category: classification.category,
    supported: classification.supported,
    evidence: classification.evidence,
    candidates: classification.candidates,
    ceiling: classification.ceiling,
    aiStatus: ai.aiStatus,
    ai: ai.aiOutput,
    confidence: ai.confidence,
    model: ai.aiStatus === "ok" ? deps.model : null,
  });
  const diagnosisInput: DiagnosisInput = {
    id: diagnosis.id,
    category: diagnosis.category,
    supported: diagnosis.supported,
    evidence: diagnosis.evidence,
    candidates: diagnosis.candidates,
    ceiling: diagnosis.ceiling,
    aiStatus: diagnosis.aiStatus,
    ai: diagnosis.ai,
    confidence: diagnosis.confidence,
  };
  const proposal = await createProposal(
    { store: deps.proposals },
    {
      diagnosis: diagnosisInput,
      workflowId: context.workflow.id,
      config: context.workflow.currentConfig,
      configVersion: context.workflow.configVersion,
    },
  );
  const proposalView = proposal
    ? buildProposalView({
        proposal,
        workflow: {
          id: context.workflow.id,
          userId: input.userId,
          config: context.workflow.currentConfig,
          configVersion: context.workflow.configVersion,
        },
        diagnosis: diagnosisInput,
        failure: {
          stepKey: context.attempt.stepKey,
          originalError: `${context.attempt.error.code}: ${maskQuotedValues(context.attempt.error.message)}`,
        },
        runId: input.runId,
      })
    : null;

  await recordEvent(deps.audit, {
    userId: input.userId,
    runId: input.runId,
    type: "diagnosis_ready",
    payload: { category: diagnosis.category, supported: diagnosis.supported },
  });
  return { diagnosis, proposal: proposalView };
}
