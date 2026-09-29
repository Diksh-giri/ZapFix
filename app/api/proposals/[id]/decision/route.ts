import { DecisionRequest } from "@/lib/schemas/api";
import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { decideProposal } from "@/server/proposals/decision";
import { proposalDeps } from "@/server/proposals";

export const POST = apiRoute({ body: DecisionRequest }, async ({ user, params, body }) =>
  decideProposal(proposalDeps(), {
    proposalId: parseId(params.id, "Proposal"),
    userId: user.id,
    decision: body.decision,
    selectedOptionId: body.selectedOptionId,
    expectedConfigVersion: body.expectedConfigVersion,
    summaryHash: body.summaryHash,
  }),
);
