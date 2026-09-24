import { AppError } from "@/lib/errors";
import { EventRequest } from "@/lib/schemas/api";
import { apiRoute } from "@/server/http/handler";
import { auditStore } from "@/server/audit";
import { recordEvent } from "@/server/audit/events";

export const POST = apiRoute({ body: EventRequest }, async ({ user, body }) => {
  const store = auditStore();
  if (!(await store.runOwnedBy(body.runId, user.id))) throw new AppError("not_found", "Run not found.");
  await recordEvent(store, { userId: user.id, runId: body.runId, type: body.type, once: true });
});
