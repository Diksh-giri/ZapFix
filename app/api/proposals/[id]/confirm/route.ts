import { ConfirmRequest } from "@/lib/schemas/api";
import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { confirmProposal } from "@/server/proposals/confirm";
import { proposalDeps } from "@/server/proposals";

/** Approve and apply: one all-or-nothing transaction (TDD Appendix E). */
export const POST = apiRoute({ body: ConfirmRequest }, async ({ user, params, body }) =>
  confirmProposal(proposalDeps(), {
    proposalId: parseId(params.id, "Proposal"),
    userId: user.id,
    selectedOptionId: body.selectedOptionId,
    expectedConfigVersion: body.expectedConfigVersion,
    summaryHash: body.summaryHash,
  }),
);
