import { apiRoute, notImplemented } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { getWorkflowService } from "@/server/workflows";

export const GET = apiRoute({}, async ({ user, params }) =>
  getWorkflowService().get(parseId(params.id, "Workflow"), user.id));
export const PATCH = notImplemented("T10", "GET/PATCH /api/workflows/{id}");
