import { CreateWorkflowRequest } from "@/lib/schemas/api";
import { apiRoute } from "@/server/http/handler";
import { getWorkflowService } from "@/server/workflows";

export const GET = apiRoute({}, async ({ user }) => ({
  workflows: await getWorkflowService().list(user.id),
}));

export const POST = apiRoute({ body: CreateWorkflowRequest }, async ({ user, body }) => {
  const workflow = await getWorkflowService().create(user.id, body);
  return Response.json(workflow, { status: 201 });
});
