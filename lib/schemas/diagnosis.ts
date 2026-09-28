import { z } from "zod";
import { AiOutputSchema } from "./ai-output";
import { CATEGORIES, CONFIDENCE_LEVELS, PROPOSAL_KINDS } from "@/lib/types";
import { FieldMappingSchema } from "./workflow-config";

export const DiagnosisEvidenceSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const DiagnosisCandidateSchema = z.object({
  id: z.string(),
  kind: z.enum(PROPOSAL_KINDS),
  fieldPath: z.string().optional(),
  proposedValue: FieldMappingSchema.optional(),
  description: z.string(),
});

/** Browser-safe representation returned by the diagnosis endpoints. */
export const DiagnosisViewSchema = z.object({
  id: z.string(),
  attemptId: z.string(),
  category: z.enum(CATEGORIES),
  supported: z.boolean(),
  evidence: z.array(DiagnosisEvidenceSchema),
  candidates: z.array(DiagnosisCandidateSchema),
  ceiling: z.enum(CONFIDENCE_LEVELS),
  aiStatus: z.enum(["ok", "unavailable", "invalid"]),
  ai: AiOutputSchema.nullable(),
  confidence: z.enum(CONFIDENCE_LEVELS).nullable(),
  model: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type DiagnosisView = z.infer<typeof DiagnosisViewSchema>;
