import { z } from "zod";
import { ATTEMPT_STATUSES } from "@/lib/types";
import { ActionConfigSchema, TriggerDataSchema } from "./workflow-config";

export const RunAttemptSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepKey: z.string(),
  attemptNo: z.number().int().positive(),
  status: z.enum(ATTEMPT_STATUSES),
  configSnapshot: ActionConfigSchema,
  requestSummary: z.record(z.string(), z.string()).optional(),
  errorRaw: z.record(z.string(), z.unknown()).optional(),
  errorStd: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string(),
  externalRef: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
});

export const RunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  userId: z.string(),
  triggerData: TriggerDataSchema,
  status: z.enum(ATTEMPT_STATUSES),
  repairCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
});

export const RunViewSchema = z.object({
  run: RunSchema,
  attempts: z.array(RunAttemptSchema),
});

export type RunView = z.infer<typeof RunViewSchema>;
