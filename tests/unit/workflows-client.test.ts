import { describe, expect, it, vi } from "vitest";
import {
  activeConnectionsFor,
  createWorkflow,
  loadWorkflowSetup,
  loadWorkflows,
  updateWorkflow,
  WorkflowRequestError,
  type FetchWorkflowRequest,
} from "@/lib/workflows-client";

const USER = "00000000-0000-4000-8000-000000000001";
const WORKFLOW = "00000000-0000-4000-8000-000000000010";
const CONNECTION = "00000000-0000-4000-8000-000000000020";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const workflow = {
  id: WORKFLOW, userId: USER, name: "Calendar demo", app: "google_calendar" as const, actionKey: "create_event",
  connectionId: CONNECTION,
  triggerSchema: { fields: [{ key: "title", label: "Title", type: "text" as const }] },
  actionConfig: { title: { kind: "mapped" as const, source: "title" } }, configVersion: 1,
  lastModifiedBy: "user", createdAt: "2026-09-27T10:00:00.000Z", updatedAt: "2026-09-27T10:00:00.000Z",
};

describe("workflow client", () => {
  it("loads and validates workflows", async () => {
    const request = vi.fn<FetchWorkflowRequest>().mockResolvedValue(json({ workflows: [workflow] }));
    await expect(loadWorkflows(request)).resolves.toHaveLength(1);
    expect(request).toHaveBeenCalledWith("/api/workflows");
  });

  it("loads app and connection setup in parallel", async () => {
    const request = vi.fn<FetchWorkflowRequest>()
      .mockResolvedValueOnce(json({ apps: [{ id: "google_calendar", provider: "google", actions: [] }] }))
      .mockResolvedValueOnce(json({ connections: [] }));
    await expect(loadWorkflowSetup(request)).resolves.toMatchObject({ connections: [] });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("creates and updates workflows with JSON requests", async () => {
    const request = vi.fn<FetchWorkflowRequest>().mockImplementation(async () => json(workflow));
    const input = {
      name: workflow.name, app: workflow.app, actionKey: workflow.actionKey,
      connectionId: CONNECTION, triggerSchema: workflow.triggerSchema, actionConfig: workflow.actionConfig,
    } as const;
    await createWorkflow(input, request);
    expect(request).toHaveBeenCalledWith("/api/workflows", expect.objectContaining({ method: "POST" }));

    await updateWorkflow(WORKFLOW, { name: "Renamed", expectedConfigVersion: 1 }, request);
    expect(request).toHaveBeenLastCalledWith(`/api/workflows/${WORKFLOW}`, expect.objectContaining({ method: "PATCH" }));
  });

  it("preserves the API error code for version conflicts", async () => {
    const request = vi.fn<FetchWorkflowRequest>().mockResolvedValue(json({
      error: { code: "version_conflict", message: "Refresh and try again." },
    }, 409));
    await expect(updateWorkflow(WORKFLOW, { name: "Renamed", expectedConfigVersion: 1 }, request))
      .rejects.toMatchObject<Partial<WorkflowRequestError>>({ code: "version_conflict" });
  });

  it("returns only active connections for the selected provider", () => {
    const base = {
      id: CONNECTION, provider: "google" as const, status: "active" as const, accountLabel: null,
      connectedAt: "2026-09-27T10:00:00.000Z", ageDays: 0, reconnectBy: null,
    };
    expect(activeConnectionsFor([base, { ...base, id: USER, status: "revoked" }], "google")).toEqual([base]);
    expect(activeConnectionsFor([base], "slack")).toEqual([]);
  });
});
