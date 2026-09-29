import { AppError } from "@/lib/errors";
import { getDiagnosisStore } from "@/server/diagnosis";
import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { getProposalStore } from "@/server/proposals";
import { buildProposalView } from "@/server/proposals/view";

export const GET = apiRoute({}, async ({ user, params }) => {
  const diagnosis = await getDiagnosisStore().get(parseId(params.id, "Diagnosis"), user.id);
  if (!diagnosis) throw new AppError("not_found", "That diagnosis was not found.");
  const context = await getProposalStore().getContextByDiagnosis(diagnosis.id, user.id);
  return { diagnosis, proposal: context?.proposal.status === "pending" ? buildProposalView(context) : null };
});
