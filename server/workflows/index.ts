import { listAdapters } from "@/server/adapters/registry";
import { createWorkflowService } from "./service";

export function getWorkflowService() {
  return createWorkflowService({
    listAdapters,
  });
}
