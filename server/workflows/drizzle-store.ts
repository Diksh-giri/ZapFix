import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { connections, proposals, workflows } from "@/db/schema";
import type * as schema from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { AppId, Provider } from "@/lib/types";
import { ActionConfigSchema, TriggerSchemaSchema } from "@/lib/schemas/workflow-config";
import type { WorkflowRecord, WorkflowStore } from "./service";

type Database = PostgresJsDatabase<typeof schema>;

function asWorkflow(row: typeof workflows.$inferSelect): WorkflowRecord {
  const triggerSchema = TriggerSchemaSchema.safeParse(row.triggerSchema);
  const actionConfig = ActionConfigSchema.safeParse(row.actionConfig);
  if (!triggerSchema.success || !actionConfig.success || !row.connectionId) {
    throw new AppError("internal", "This workflow's settings are not valid.");
  }
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    app: row.app as AppId,
    actionKey: row.actionKey,
    connectionId: row.connectionId,
    triggerSchema: triggerSchema.data,
    actionConfig: actionConfig.data,
    configVersion: row.configVersion,
    lastModifiedBy: row.lastModifiedBy as WorkflowRecord["lastModifiedBy"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createDrizzleWorkflowStore(db: Database): WorkflowStore {
  return {
    async getConnection(id, userId) {
      const [row] = await db
        .select({ provider: connections.provider })
        .from(connections)
        .where(and(eq(connections.id, id), eq(connections.userId, userId)))
        .limit(1);
      return row ? { provider: row.provider as Provider } : undefined;
    },

    async create(input) {
      const [row] = await db.insert(workflows).values(input).returning();
      if (!row) throw new Error("The workflow could not be saved.");
      return asWorkflow(row);
    },

    async list(userId) {
      const rows = await db
        .select()
        .from(workflows)
        .where(eq(workflows.userId, userId))
        .orderBy(desc(workflows.updatedAt));
      return rows.map(asWorkflow);
    },

    async get(id, userId) {
      const [row] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
        .limit(1);
      return row ? asWorkflow(row) : undefined;
    },

    async update(input) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ configVersion: workflows.configVersion })
          .from(workflows)
          .where(and(eq(workflows.id, input.id), eq(workflows.userId, input.userId)))
          .limit(1);
        if (!current) return "not_found" as const;
        if (current.configVersion !== input.expectedConfigVersion) {
          return "version_conflict" as const;
        }

        const [updated] = await tx
          .update(workflows)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.actionConfig !== undefined ? { actionConfig: input.actionConfig } : {}),
            configVersion: current.configVersion + 1,
            lastModifiedBy: "user",
            updatedAt: new Date(),
          })
          .where(and(
            eq(workflows.id, input.id),
            eq(workflows.userId, input.userId),
            eq(workflows.configVersion, input.expectedConfigVersion),
          ))
          .returning();
        if (!updated) return "version_conflict" as const;

        await tx
          .update(proposals)
          .set({ status: "expired" })
          .where(and(
            eq(proposals.workflowId, input.id),
            eq(proposals.status, "pending"),
          ));

        return asWorkflow(updated);
      });
    },
  };
}
