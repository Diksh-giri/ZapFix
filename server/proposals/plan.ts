import { deepEqual } from "@/lib/canonical";
import { FieldMappingSchema, type ActionConfig } from "@/lib/schemas/workflow-config";
import { confidenceRank } from "@/lib/types";
import { fieldKeyFromPath, readFieldValue } from "@/server/changes/applier";
import type { Candidate } from "@/server/diagnosis/rules/types";
import { describeEffect } from "./summary";
import type { DiagnosisInput, ProposalDraft } from "./types";

const RECONNECT_EFFECT = "Reconnect the app from the Connections page. Nothing in your workflow settings changes.";

/** A config-change candidate that is safe to offer, or undefined. Bad candidates are dropped, never repaired. */
function usableChange(candidate: Candidate, config: ActionConfig): (Candidate & { fieldPath: string }) | undefined {
  if (candidate.kind !== "config_change" || !candidate.fieldPath) return undefined;
  try {
    fieldKeyFromPath(candidate.fieldPath);
  } catch {
    return undefined;
  }
  const proposed = FieldMappingSchema.safeParse(candidate.proposedValue);
  if (!proposed.success) return undefined;
  if (deepEqual(readFieldValue(config, candidate.fieldPath) ?? null, proposed.data)) return undefined; // changes nothing
  return { ...candidate, fieldPath: candidate.fieldPath, proposedValue: proposed.data };
}

/**
 * Decides whether a diagnosis gets a proposal, and builds it. Returns null when NO fix should be
 * offered: unsupported failure, AI unavailable or invalid, Low confidence, no choice made, a choice
 * that is not on the rules' list, or a choice that would change nothing (AGENTS.md section 7).
 */
export function planProposal(input: {
  diagnosis: DiagnosisInput;
  workflowId: string;
  config: ActionConfig;
  configVersion: number;
}): ProposalDraft | null {
  const { diagnosis, workflowId, config, configVersion } = input;
  if (!diagnosis.supported || diagnosis.category === "unsupported") return null;
  if (diagnosis.aiStatus !== "ok" || !diagnosis.ai || !diagnosis.confidence) return null;
  if (diagnosis.confidence === "low" || diagnosis.ceiling === "low") return null;
  if (confidenceRank(diagnosis.confidence) > confidenceRank(diagnosis.ceiling)) return null;

  const selectedId = diagnosis.ai.selected_candidate_id;
  if (!selectedId) return null;
  const selected = diagnosis.candidates.find((c) => c.id === selectedId);
  if (!selected) return null;

  const base = { diagnosisId: diagnosis.id, workflowId, baseConfigVersion: configVersion };

  if (selected.kind === "reconnect_guidance") {
    return {
      ...base,
      kind: "reconnect_guidance",
      fieldPath: null,
      currentValue: null,
      proposedValue: null,
      validOptions: [],
      expectedEffect: RECONNECT_EFFECT,
    };
  }

  const options = diagnosis.candidates.flatMap((c) => usableChange(c, config) ?? []);
  const chosen = options.find((o) => o.id === selectedId);
  if (!chosen?.proposedValue) return null;
  const current = readFieldValue(config, chosen.fieldPath) ?? null;

  return {
    ...base,
    kind: "config_change",
    fieldPath: chosen.fieldPath,
    currentValue: current,
    proposedValue: chosen.proposedValue,
    validOptions: options,
    expectedEffect: describeEffect(chosen.fieldPath, current, chosen.proposedValue),
  };
}
