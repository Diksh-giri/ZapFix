import { apiRoute } from "@/server/http/handler";
import { parseId } from "@/server/http/ids";
import { getRunEngine } from "@/server/runs";

export const GET = apiRoute({}, async ({ user, params }) => getRunEngine().getRun(parseId(params.id, "Run"), user.id));
