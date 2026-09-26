import { RestoreRequest } from "@/lib/schemas/api";
import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { restoreChange } from "@/server/proposals/restore";
import { proposalDeps } from "@/server/proposals";

/** The body is optional: a bare POST means confirmOverwrite is false. */
export const POST = apiRoute({ body: RestoreRequest.optional().transform((v) => v ?? {}) }, async ({ user, params, body }) =>
  restoreChange(proposalDeps(), { changeId: parseId(params.id, "Change"), userId: user.id, confirmOverwrite: body.confirmOverwrite }),
);
