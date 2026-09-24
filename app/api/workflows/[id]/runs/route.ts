import { RunWorkflowRequest } from "@/lib/schemas/api";
import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { getRunEngine } from "@/server/runs";

export const POST = apiRoute({ body: RunWorkflowRequest }, async ({ user, params, body }) => {
  const engine = getRunEngine();
  const run = await engine.startRun(parseId(params.id, "Workflow"), user.id, body.triggerData);
  return Response.json(await engine.getRun(run.id, user.id), { status: 201 });
});
