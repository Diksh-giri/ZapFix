import { RunViewSchema, type RunView } from "@/lib/schemas/runs";

export type FetchRunRequest = (input: string, init?: RequestInit) => Promise<Response>;

export class RunRequestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function json(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body
      ? (body as { error?: { code?: unknown; message?: unknown } }).error
      : undefined;
    throw new RunRequestError(
      typeof error?.code === "string" ? error.code : "request_failed",
      typeof error?.message === "string" ? error.message : "The run could not be loaded.",
    );
  }
  return body;
}

export async function loadRun(id: string, fetchRequest: FetchRunRequest = fetch): Promise<RunView> {
  const parsed = RunViewSchema.safeParse(await json(await fetchRequest(`/api/runs/${id}`, {
    headers: { accept: "application/json" },
  })));
  if (!parsed.success) throw new RunRequestError("invalid_response", "ZapFix returned invalid run data.");
  return parsed.data;
}
