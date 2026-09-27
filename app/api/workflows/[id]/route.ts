import { PatchWorkflowRequest } from "@/lib/schemas/api";
import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { getWorkflowService } from "@/server/workflows";

export const GET = apiRoute({}, async ({ user, params }) =>
  getWorkflowService().get(parseId(params.id, "Workflow"), user.id));

export const PATCH = apiRoute({ body: PatchWorkflowRequest }, async ({ user, params, body }) =>
  getWorkflowService().update(parseId(params.id, "Workflow"), user.id, body));
