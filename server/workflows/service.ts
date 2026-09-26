import { AppError } from "@/lib/errors";
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

export type WorkflowCreateReadStore = Pick<
  WorkflowStore,
  "getConnection" | "create" | "list" | "get"
>;

export interface WorkflowServiceDeps {
  store: WorkflowCreateReadStore;
  getAdapter: (app: AppId) => AppAdapter;
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

function validateConfig(adapter: AppAdapter, actionKey: string, actionConfig: ActionConfig): void {
  const problems = adapter.validateConfig(actionKey, actionConfig);
  if (problems.length > 0) {
    throw new AppError("validation_failed", "The workflow configuration is not valid.", { problems });
  }
}

export function createWorkflowService(deps: WorkflowServiceDeps) {
  return {
    listApps() {
      return deps.listAdapters().map(({ id, provider, actions }) => ({ id, provider, actions }));
    },

    async create(userId: string, input: CreateWorkflowInput): Promise<WorkflowRecord> {
      const adapter = deps.getAdapter(input.app);
      validateConfig(adapter, input.actionKey, input.actionConfig);

      const connection = await deps.store.getConnection(input.connectionId, userId);
      if (!connection || connection.provider !== adapter.provider) {
        throw new AppError("validation_failed", "Choose a connection for this app.");
      }

      return deps.store.create({ userId, ...input });
    },

    list(userId: string): Promise<WorkflowRecord[]> {
      return deps.store.list(userId);
    },

    async get(id: string, userId: string): Promise<WorkflowRecord> {
      const workflow = await deps.store.get(id, userId);
      if (!workflow) throw new AppError("not_found", "Workflow not found.");
      return workflow;
    },
  };
}
