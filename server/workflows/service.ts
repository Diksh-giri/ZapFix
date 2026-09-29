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
  connectionId: string | null;
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
    connectionId?: string;
  }): Promise<"not_found" | "version_conflict" | WorkflowRecord>;
}

export interface WorkflowServiceDeps {
  store: WorkflowStore;
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

export interface UpdateWorkflowInput {
  name?: string;
  actionConfig?: ActionConfig;
  connectionId?: string;
  expectedConfigVersion: number;
}

function validateConfig(
  adapter: AppAdapter,
  actionKey: string,
  triggerSchema: TriggerSchema,
  actionConfig: ActionConfig,
): void {
  const triggerKeys = new Set(triggerSchema.fields.map((field) => field.key));
  const problems = [
    ...adapter.validateConfig(actionKey, actionConfig),
    ...Object.entries(actionConfig).flatMap(([field, mapping]) =>
      mapping.kind === "mapped" && !triggerKeys.has(mapping.source)
        ? [`"${field}" maps from unknown trigger field "${mapping.source}"`]
        : []),
  ];
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
      validateConfig(adapter, input.actionKey, input.triggerSchema, input.actionConfig);

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

    async update(id: string, userId: string, input: UpdateWorkflowInput): Promise<WorkflowRecord> {
      const current = await deps.store.get(id, userId);
      if (!current) throw new AppError("not_found", "Workflow not found.");

      if (input.actionConfig !== undefined) {
        validateConfig(
          deps.getAdapter(current.app),
          current.actionKey,
          current.triggerSchema,
          input.actionConfig,
        );
      }

      if (input.connectionId !== undefined) {
        const adapter = deps.getAdapter(current.app);
        const connection = await deps.store.getConnection(input.connectionId, userId);
        if (!connection || connection.provider !== adapter.provider) {
          throw new AppError("validation_failed", "Choose a connection for this app.");
        }
      }

      const updated = await deps.store.update({ id, userId, ...input });
      if (updated === "not_found") throw new AppError("not_found", "Workflow not found.");
      if (updated === "version_conflict") {
        throw new AppError(
          "version_conflict",
          "This workflow changed after you opened it. Refresh and try again.",
        );
      }
      return updated;
    },
  };
}
