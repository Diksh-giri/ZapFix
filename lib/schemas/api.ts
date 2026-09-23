import { z } from "zod";
import { ActionConfigSchema, TriggerDataSchema, TriggerSchemaSchema } from "./workflow-config";
import { APP_IDS } from "@/lib/types";

/** Request bodies for the 18 endpoints in TDD section 14. Add each schema next to its route. */

export const CreateWorkflowRequest = z.object({
  name: z.string().min(1).max(120),
  app: z.enum(APP_IDS),
  actionKey: z.string().min(1),
  connectionId: z.string().uuid(),
  triggerSchema: TriggerSchemaSchema,
  actionConfig: ActionConfigSchema,
});

export const PatchWorkflowRequest = z.object({
  name: z.string().min(1).max(120).optional(),
  actionConfig: ActionConfigSchema.optional(),
  expectedConfigVersion: z.number().int().positive(),
});

export const RunWorkflowRequest = z.object({ triggerData: TriggerDataSchema });

export const RetryRequest = z.object({ confirmUncertain: z.boolean().optional() });

export const DecisionRequest = z.object({ decision: z.enum(["rejected", "exited"]) });

export const ConfirmRequest = z.object({
  selectedOptionId: z.string().optional(),
  expectedConfigVersion: z.number().int().positive(),
  summaryHash: z.string().length(64),
});

export const RestoreRequest = z.object({ confirmOverwrite: z.boolean().optional() });

export const EventRequest = z.object({ type: z.enum(["failure_opened", "summary_viewed"]) });
