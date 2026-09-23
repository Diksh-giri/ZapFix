import type { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { getSessionUser, type SessionUser } from "@/server/access/session";

/**
 * Every route handler goes through apiRoute (TDD section 12, "Request handling"):
 * (1) read session (2) validate body with Zod (3) call the handler (4) return JSON or the
 * standard error body. Ownership checks and rate limits happen inside the handler/service.
 */
export interface RouteCtx<B> {
  user: SessionUser;
  body: B;
  params: Record<string, string>;
  req: Request;
}

export function apiRoute<B = undefined>(
  opts: { body?: z.ZodType<B>; auth?: boolean },
  fn: (ctx: RouteCtx<B>) => Promise<unknown>,
) {
  return async (req: Request, routeCtx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const user = opts.auth === false ? ({ id: "", email: "" } as SessionUser) : await getSessionUser();
      if (!user) throw new AppError("unauthenticated", "Please sign in.");

      let body = undefined as B;
      if (opts.body) {
        const json: unknown = await req.json().catch(() => undefined);
        const parsed = opts.body.safeParse(json);
        if (!parsed.success) {
          throw new AppError("validation_failed", "The request is not valid.", {
            issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          });
        }
        body = parsed.data;
      }

      const params = await routeCtx.params;
      const result = await fn({ user, body, params, req });
      if (result instanceof Response) return result;
      return result === undefined ? new Response(null, { status: 204 }) : Response.json(result);
    } catch (err) {
      if (err instanceof AppError) return Response.json(toErrorBody(err), { status: err.status });
      console.error("Unhandled error", err instanceof Error ? err.message : "unknown"); // never log payloads or tokens
      return Response.json(toErrorBody(new AppError("internal", "Something went wrong.")), { status: 500 });
    }
  };
}

/** Placeholder used by every endpoint that is not built yet. Replace with a real handler. */
export function notImplemented(task: string, what: string) {
  return apiRoute({ auth: false }, async () => {
    throw new AppError("not_implemented", `${what} is not implemented yet (${task}).`);
  });
}
