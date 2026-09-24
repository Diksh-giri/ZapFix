import { z } from "zod";
import { AppError } from "@/lib/errors";
import { apiRoute } from "@/server/http/handler";
import { getConnectionsService } from "@/server/connections";

export const DELETE = apiRoute({}, async ({ user, params, req }) => {
  const id = z.string().uuid().safeParse(params.param);
  if (!id.success) throw new AppError("not_found", "Connection not found.");
  await getConnectionsService(new URL(req.url).origin).disconnect(id.data, user.id);
});
