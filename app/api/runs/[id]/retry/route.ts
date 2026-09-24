import { RetryRequest } from "@/lib/schemas/api";
import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { getRunEngine } from "@/server/runs";

// The Idempotency-Key header is accepted but not stored (decision recorded in docs/TASK_BRIEFS.md, T12).
export const POST = apiRoute({ body: RetryRequest }, async ({ user, params, body }) => {
  const engine = getRunEngine();
  const runId = parseId(params.id, "Run");
  await engine.retryFailedStep(runId, user.id, { confirmUncertain: body.confirmUncertain });
  return engine.getRun(runId, user.id);
});
