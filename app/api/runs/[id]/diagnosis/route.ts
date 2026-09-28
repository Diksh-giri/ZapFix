import { diagnosisDeps } from "@/server/diagnosis";
import { diagnoseRun } from "@/server/diagnosis/service";
import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";

export const POST = apiRoute({}, async ({ user, params }) =>
  diagnoseRun(diagnosisDeps(), {
    runId: parseId(params.id, "Run"),
    userId: user.id,
  }),
);
