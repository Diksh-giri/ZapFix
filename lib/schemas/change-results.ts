import { z } from "zod";
import { ActionConfigSchema, FieldMappingSchema } from "./workflow-config";

const ChangedWorkflowSchema = z.object({
  id: z.string(),
  configVersion: z.number().int().positive(),
  config: ActionConfigSchema,
});

export const ConfirmResultSchema = z.object({
  workflow: ChangedWorkflowSchema.extend({ lastModifiedBy: z.literal("debugger") }),
  configChangeId: z.string(),
  approvalId: z.string(),
});

export const RestoreResultSchema = z.object({
  configChangeId: z.string(),
  status: z.literal("restored"),
  workflow: ChangedWorkflowSchema,
  note: z.string(),
});

/** Browser state assembled from the server confirm result and the summary the user approved. */
export const AppliedChangeViewSchema = z.object({
  configChangeId: z.string(),
  approvalId: z.string(),
  fieldPath: z.string(),
  originalValue: FieldMappingSchema.nullable(),
  updatedValue: FieldMappingSchema,
});

export type ConfirmResult = z.infer<typeof ConfirmResultSchema>;
export type RestoreResult = z.infer<typeof RestoreResultSchema>;
export type AppliedChangeView = z.infer<typeof AppliedChangeViewSchema>;
