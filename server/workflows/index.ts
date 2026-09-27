import "server-only";
import { db } from "@/db/client";
import { getAdapter, listAdapters } from "@/server/adapters/registry";
import { createDrizzleWorkflowStore } from "./drizzle-store";
import { createWorkflowService } from "./service";

export function getWorkflowService() {
  return createWorkflowService({
    store: createDrizzleWorkflowStore(db),
    getAdapter,
    listAdapters,
  });
}
