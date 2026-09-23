import { z } from "zod";
import { CONFIDENCE_LEVELS } from "@/lib/types";

/** What the model must return (TDD section 15). Validated before anything is stored or shown. */
export const AiOutputSchema = z.object({
  likely_cause: z.string().min(1).max(300),
  explanation: z.string().min(1).max(600),
  selected_candidate_id: z.string().nullable(),
  why_this_fix: z.string().min(1).max(300),
  confidence: z.enum(CONFIDENCE_LEVELS),
  uncertainty_note: z.string().max(300).nullable(),
});
export type AiOutput = z.infer<typeof AiOutputSchema>;
