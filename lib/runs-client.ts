import { RunViewSchema, type RunView } from "@/lib/schemas/runs";
import { DiagnosisViewSchema, type DiagnosisView } from "@/lib/schemas/diagnosis";
import { RestoreResultSchema, type RestoreResult } from "@/lib/schemas/change-results";
import { z } from "zod";

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

export async function retryRun(
  id: string,
  confirmUncertain: boolean,
  fetchRequest: FetchRunRequest = fetch,
): Promise<RunView> {
  const parsed = RunViewSchema.safeParse(await json(await fetchRequest(`/api/runs/${id}/retry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(confirmUncertain ? { confirmUncertain: true } : {}) }),
  })));
  if (!parsed.success) throw new RunRequestError("invalid_response", "ZapFix returned invalid retry data.");
  return parsed.data;
}

const DiagnosisStartSchema = z.object({
  diagnosis: DiagnosisViewSchema,
  proposal: z.unknown().nullable(),
});
export type DiagnosisStart = z.infer<typeof DiagnosisStartSchema>;

export async function requestDiagnosis(id: string, fetchRequest: FetchRunRequest = fetch): Promise<DiagnosisStart> {
  const parsed = DiagnosisStartSchema.safeParse(await json(await fetchRequest(`/api/runs/${id}/diagnosis`, {
    method: "POST",
  })));
  if (!parsed.success) throw new RunRequestError("invalid_response", "ZapFix returned invalid diagnosis data.");
  return parsed.data;
}

export async function loadDiagnosis(id: string, fetchRequest: FetchRunRequest = fetch): Promise<DiagnosisView> {
  const parsed = DiagnosisViewSchema.safeParse(await json(await fetchRequest(`/api/diagnoses/${id}`, {
    headers: { accept: "application/json" },
  })));
  if (!parsed.success) throw new RunRequestError("invalid_response", "ZapFix returned invalid diagnosis data.");
  return parsed.data;
}

export async function recordFailureOpened(id: string, fetchRequest: FetchRunRequest = fetch): Promise<void> {
  await json(await fetchRequest("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "failure_opened", runId: id }),
  }));
}

export async function restoreAppliedChange(
  id: string,
  confirmOverwrite: boolean,
  fetchRequest: FetchRunRequest = fetch,
): Promise<RestoreResult> {
  const parsed = RestoreResultSchema.safeParse(await json(await fetchRequest(`/api/config-changes/${id}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(confirmOverwrite ? { confirmOverwrite: true } : {}),
  })));
  if (!parsed.success) throw new RunRequestError("invalid_response", "ZapFix returned invalid restore data.");
  return parsed.data;
}
