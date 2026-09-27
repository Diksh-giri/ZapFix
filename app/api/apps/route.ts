import { apiRoute } from "@/server/http/handler";
import { getWorkflowService } from "@/server/workflows";

export const GET = apiRoute({}, async () => ({ apps: getWorkflowService().listApps() }));
