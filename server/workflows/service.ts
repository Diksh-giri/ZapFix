import type { AppId, Provider } from "@/lib/types";
import type { ActionConfig, TriggerSchema } from "@/lib/schemas/workflow-config";
import type { AppAdapter } from "@/server/adapters/types";

export interface WorkflowRecord {
  id: string;
  userId: string;
  name: string;
  app: AppId;
  actionKey: string;
  connectionId: string;
  triggerSchema: TriggerSchema;
  actionConfig: ActionConfig;
  configVersion: number;
  lastModifiedBy: "user" | "debugger";
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStore {
  getConnection(id: string, userId: string): Promise<{ provider: Provider } | undefined>;
  create(input: Omit<WorkflowRecord, "id" | "configVersion" | "lastModifiedBy" | "createdAt" | "updatedAt">): Promise<WorkflowRecord>;
  list(userId: string): Promise<WorkflowRecord[]>;
  get(id: string, userId: string): Promise<WorkflowRecord | undefined>;
  update(input: {
    id: string;
    userId: string;
    expectedConfigVersion: number;
    name?: string;
    actionConfig?: ActionConfig;
  }): Promise<"not_found" | "version_conflict" | WorkflowRecord>;
}

export interface WorkflowServiceDeps {
  listAdapters: () => AppAdapter[];
}

export interface CreateWorkflowInput {
  name: string;
  app: AppId;
  actionKey: string;
  connectionId: string;
  triggerSchema: TriggerSchema;
  actionConfig: ActionConfig;
}

export function createWorkflowService(deps: WorkflowServiceDeps) {
  return {
    listApps() {
      return deps.listAdapters().map(({ id, provider, actions }) => ({ id, provider, actions }));
    },
  };
}
