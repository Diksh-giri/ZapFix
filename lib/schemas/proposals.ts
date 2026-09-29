import { z } from "zod";
import { CONFIDENCE_LEVELS, PROPOSAL_KINDS } from "@/lib/types";
import { FieldMappingSchema } from "./workflow-config";

export const ApprovalSummarySchema = z.object({
  failedStep: z.string(),
  originalError: z.string(),
  likelyCause: z.string(),
  evidence: z.array(z.object({ label: z.string(), value: z.string() })),
  fieldPath: z.string(),
  currentValue: FieldMappingSchema.nullable(),
  proposedValue: FieldMappingSchema,
  expectedEffect: z.string(),
  confidence: z.enum(CONFIDENCE_LEVELS),
  uncertaintyNote: z.string().nullable(),
});

export const ProposalOptionViewSchema = z.object({
  id: z.string(),
  description: z.string(),
  fieldPath: z.string(),
  isDefault: z.boolean(),
  summary: ApprovalSummarySchema,
  summaryHash: z.string().length(64),
});

export const ProposalViewSchema = z.object({
  id: z.string(),
  kind: z.enum(PROPOSAL_KINDS),
  status: z.enum(["pending", "decided", "superseded", "expired"]),
  baseConfigVersion: z.number().int().positive(),
  expectedEffect: z.string(),
  options: z.array(ProposalOptionViewSchema),
});

export type ApprovalSummaryView = z.infer<typeof ApprovalSummarySchema>;
export type ProposalOptionView = z.infer<typeof ProposalOptionViewSchema>;
export type ProposalView = z.infer<typeof ProposalViewSchema>;
