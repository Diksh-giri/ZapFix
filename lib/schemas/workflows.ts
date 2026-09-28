import { z } from "zod";
import { APP_IDS, PROVIDERS } from "@/lib/types";
import { ActionConfigSchema, TriggerSchemaSchema } from "@/lib/schemas/workflow-config";

export const ActionFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  type: z.enum(["text", "email", "datetime_rfc3339", "text_list"]),
});

export const AppCatalogItemSchema = z.object({
  id: z.enum(APP_IDS),
  provider: z.enum(PROVIDERS),
  actions: z.array(z.object({ key: z.string(), label: z.string(), fields: z.array(ActionFieldSchema) })),
});

export const WorkflowSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  app: z.enum(APP_IDS),
  actionKey: z.string(),
  connectionId: z.string().uuid(),
  triggerSchema: TriggerSchemaSchema,
  actionConfig: ActionConfigSchema,
  configVersion: z.number().int().positive(),
  lastModifiedBy: z.enum(["user", "debugger"]),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export const AppsResponseSchema = z.object({ apps: z.array(AppCatalogItemSchema) });
export const WorkflowsResponseSchema = z.object({ workflows: z.array(WorkflowSchema) });

export type ActionField = z.infer<typeof ActionFieldSchema>;
export type AppCatalogItem = z.infer<typeof AppCatalogItemSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
