import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  service: {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/server/access/session", () => ({
  getSessionUser: async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    email: "learner@example.com",
  }),
}));
vi.mock("@/server/workflows", () => ({ getWorkflowService: () => mocks.service }));

import { GET as listWorkflows, POST as createWorkflow } from "@/app/api/workflows/route";
import { GET as getWorkflow, PATCH as patchWorkflow } from "@/app/api/workflows/[id]/route";

const USER = "00000000-0000-4000-8000-000000000001";
const WORKFLOW = "00000000-0000-4000-8000-000000000010";
const CONNECTION = "00000000-0000-4000-8000-000000000020";
const params = (id?: string): { params: Promise<Record<string, string>> } => {
  const values: Record<string, string> = {};
  if (id) values.id = id;
  return { params: Promise.resolve(values) };
};
const request = (url: string, method = "GET", body?: unknown) => new Request(url, {
  method,
  ...(body === undefined
    ? {}
    : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

beforeEach(() => vi.clearAllMocks());

describe("workflow create and read routes", () => {
  it("lists only the signed-in user's workflows", async () => {
    mocks.service.list.mockResolvedValue([{ id: WORKFLOW, name: "Demo" }]);

    const response = await listWorkflows(request("http://test/api/workflows"), params());

    expect(await response.json()).toEqual({ workflows: [{ id: WORKFLOW, name: "Demo" }] });
    expect(mocks.service.list).toHaveBeenCalledWith(USER);
  });

  it("validates and creates a workflow with HTTP 201", async () => {
    const body = {
      name: "Demo",
      app: "google_calendar",
      actionKey: "create_event",
      connectionId: CONNECTION,
      triggerSchema: { fields: [{ key: "title", label: "Title", type: "text" }] },
      actionConfig: {
        title: { kind: "mapped", source: "title" },
        start: { kind: "static", value: "2026-03-15T10:00:00Z" },
        end: { kind: "static", value: "2026-03-15T11:00:00Z" },
        attendee_email: { kind: "static", value: "a@example.com" },
      },
    };
    mocks.service.create.mockResolvedValue({ id: WORKFLOW, ...body, configVersion: 1 });

    const response = await createWorkflow(
      request("http://test/api/workflows", "POST", body),
      params(),
    );

    expect(response.status).toBe(201);
    expect(mocks.service.create).toHaveBeenCalledWith(USER, body);
  });

  it("returns 422 before the service receives an invalid request", async () => {
    const response = await createWorkflow(
      request("http://test/api/workflows", "POST", { name: "" }),
      params(),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("validation_failed");
    expect(mocks.service.create).not.toHaveBeenCalled();
  });

  it("opens a workflow using the signed-in user and validated path id", async () => {
    mocks.service.get.mockResolvedValue({ id: WORKFLOW, name: "Demo" });

    const response = await getWorkflow(
      request(`http://test/api/workflows/${WORKFLOW}`),
      params(WORKFLOW),
    );

    expect(await response.json()).toEqual({ id: WORKFLOW, name: "Demo" });
    expect(mocks.service.get).toHaveBeenCalledWith(WORKFLOW, USER);
  });

  it("rejects a malformed workflow id before calling the service", async () => {
    const response = await getWorkflow(
      request("http://test/api/workflows/not-a-uuid"),
      params("not-a-uuid"),
    );

    expect(response.status).toBe(404);
    expect(mocks.service.get).not.toHaveBeenCalled();
  });
});

describe("workflow update route", () => {
  it("passes the path id, signed-in user, and expected version to the service", async () => {
    const body = { name: "Renamed", expectedConfigVersion: 1 };
    mocks.service.update.mockResolvedValue({
      id: WORKFLOW,
      name: "Renamed",
      configVersion: 2,
    });

    const response = await patchWorkflow(
      request(`http://test/api/workflows/${WORKFLOW}`, "PATCH", body),
      params(WORKFLOW),
    );

    expect(await response.json()).toEqual({
      id: WORKFLOW,
      name: "Renamed",
      configVersion: 2,
    });
    expect(mocks.service.update).toHaveBeenCalledWith(WORKFLOW, USER, body);
  });

  it("maps a stale expected version to HTTP 409", async () => {
    mocks.service.update.mockRejectedValue(new AppError(
      "version_conflict",
      "This workflow changed after you opened it. Refresh and try again.",
    ));

    const response = await patchWorkflow(
      request(`http://test/api/workflows/${WORKFLOW}`, "PATCH", {
        name: "Renamed",
        expectedConfigVersion: 1,
      }),
      params(WORKFLOW),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("version_conflict");
  });

  it("rejects an empty update before calling the service", async () => {
    const response = await patchWorkflow(
      request(`http://test/api/workflows/${WORKFLOW}`, "PATCH", {
        expectedConfigVersion: 1,
      }),
      params(WORKFLOW),
    );

    expect(response.status).toBe(422);
    expect(mocks.service.update).not.toHaveBeenCalled();
  });
});
