/** Liveness check. Also a working example of a route with no auth and no body. */
export function GET() {
  return Response.json({ ok: true });
}
