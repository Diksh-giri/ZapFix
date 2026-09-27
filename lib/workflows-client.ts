import { ConnectionsResponseSchema, type ClientConnection } from "@/lib/schemas/connections";
import { AppsResponseSchema, WorkflowSchema, WorkflowsResponseSchema } from "@/lib/schemas/workflows";
import type { ActionConfig, TriggerData, TriggerSchema } from "@/lib/schemas/workflow-config";
import type { AppId } from "@/lib/types";

export type FetchWorkflowRequest = (input: string, init?: RequestInit) => Promise<Response>;

export class WorkflowRequestError extends Error {
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
    throw new WorkflowRequestError(
      typeof error?.code === "string" ? error.code : "request_failed",
      typeof error?.message === "string" ? error.message : "The request could not be completed.",
    );
  }
  return body;
}

export async function loadWorkflowSetup(fetchRequest: FetchWorkflowRequest = fetch) {
  const [appsResponse, connectionsResponse] = await Promise.all([
    fetchRequest("/api/apps", { headers: { accept: "application/json" } }),
    fetchRequest("/api/connections", { headers: { accept: "application/json" } }),
  ]);
  const apps = AppsResponseSchema.safeParse(await json(appsResponse));
  const connections = ConnectionsResponseSchema.safeParse(await json(connectionsResponse));
  if (!apps.success || !connections.success) throw new WorkflowRequestError("invalid_response", "ZapFix returned invalid setup data.");
  return { apps: apps.data.apps, connections: connections.data.connections };
}

export async function loadWorkflows(fetchRequest: FetchWorkflowRequest = fetch) {
  const parsed = WorkflowsResponseSchema.safeParse(await json(await fetchRequest("/api/workflows")));
  if (!parsed.success) throw new WorkflowRequestError("invalid_response", "ZapFix returned an invalid workflow list.");
  return parsed.data.workflows;
}

export async function loadWorkflow(id: string, fetchRequest: FetchWorkflowRequest = fetch) {
  const parsed = WorkflowSchema.safeParse(await json(await fetchRequest(`/api/workflows/${id}`)));
  if (!parsed.success) throw new WorkflowRequestError("invalid_response", "ZapFix returned an invalid workflow.");
  return parsed.data;
}

export interface NewWorkflow {
  name: string;
  app: AppId;
  actionKey: string;
  connectionId: string;
  triggerSchema: TriggerSchema;
  actionConfig: ActionConfig;
}

export async function createWorkflow(input: NewWorkflow, fetchRequest: FetchWorkflowRequest = fetch) {
  const parsed = WorkflowSchema.safeParse(await json(await fetchRequest("/api/workflows", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  })));
  if (!parsed.success) throw new WorkflowRequestError("invalid_response", "ZapFix returned an invalid workflow.");
  return parsed.data;
}

export async function updateWorkflow(
  id: string,
  input: { name?: string; actionConfig?: ActionConfig; expectedConfigVersion: number },
  fetchRequest: FetchWorkflowRequest = fetch,
) {
  const parsed = WorkflowSchema.safeParse(await json(await fetchRequest(`/api/workflows/${id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  })));
  if (!parsed.success) throw new WorkflowRequestError("invalid_response", "ZapFix returned an invalid workflow.");
  return parsed.data;
}

export async function runWorkflow(id: string, triggerData: TriggerData, fetchRequest: FetchWorkflowRequest = fetch) {
  return json(await fetchRequest(`/api/workflows/${id}/runs`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ triggerData }),
  }));
}

export function activeConnectionsFor(
  connections: ClientConnection[],
  provider: "google" | "slack",
) {
  return connections.filter((connection) => connection.provider === provider && connection.status === "active");
}
