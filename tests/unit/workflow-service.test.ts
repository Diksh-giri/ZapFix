import { beforeEach, describe, expect, it } from "vitest";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { fakeAdapter } from "@/server/adapters/fake";
import {
  createWorkflowService,
  type WorkflowCreateReadStore,
  type WorkflowRecord,
} from "@/server/workflows/service";

const USER = "user-1";
const OTHER = "user-2";
const triggerSchema = { fields: [{ key: "title", label: "Title", type: "text" as const }] };
const validConfig: ActionConfig = {
  title: { kind: "mapped", source: "title" },
  start: { kind: "static", value: "2026-03-15T10:00:00Z" },
  end: { kind: "static", value: "2026-03-15T11:00:00Z" },
  attendee_email: { kind: "static", value: "test@example.com" },
};

let rows: WorkflowRecord[];

function memoryStore(): WorkflowCreateReadStore {
  return {
    async getConnection(id, userId) {
      if (id === "conn-google" && userId === USER) return { provider: "google" };
      if (id === "conn-slack" && userId === USER) return { provider: "slack" };
      return undefined;
    },
    async create(input) {
      const now = new Date("2026-09-26T12:00:00Z");
      const row: WorkflowRecord = {
        ...input,
        id: `wf-${rows.length + 1}`,
        configVersion: 1,
        lastModifiedBy: "user",
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return row;
    },
    async list(userId) {
      return rows.filter((row) => row.userId === userId);
    },
    async get(id, userId) {
      return rows.find((row) => row.id === id && row.userId === userId);
    },
  };
}

function service() {
  return createWorkflowService({
    store: memoryStore(),
    getAdapter: () => fakeAdapter,
    listAdapters: () => [fakeAdapter],
  });
}

beforeEach(() => {
  rows = [];
});

describe("workflow service catalog", () => {
  it("returns only the public adapter catalog fields", () => {
    const workflowService = service();

    expect(workflowService.listApps()).toEqual([
      {
        id: "google_calendar",
        provider: "google",
        actions: fakeAdapter.actions,
      },
    ]);
  });

  it("does not expose adapter execution functions", () => {
    const [app] = service().listApps();

    expect(app).not.toHaveProperty("execute");
    expect(app).not.toHaveProperty("validateConfig");
  });
});

describe("workflow service create and read", () => {
  it("creates version 1 using the caller's matching provider connection", async () => {
    const created = await service().create(USER, {
      name: "Calendar demo",
      app: "google_calendar",
      actionKey: "create_event",
      connectionId: "conn-google",
      triggerSchema,
      actionConfig: validConfig,
    });

    expect(created).toMatchObject({
      userId: USER,
      configVersion: 1,
      lastModifiedBy: "user",
    });
  });

  it("refuses another user's connection and a connection for the wrong provider", async () => {
    const input = {
      name: "Calendar demo",
      app: "google_calendar" as const,
      actionKey: "create_event",
      connectionId: "conn-google",
      triggerSchema,
      actionConfig: validConfig,
    };

    await expect(service().create(OTHER, input)).rejects.toMatchObject({ code: "validation_failed" });
    await expect(service().create(USER, { ...input, connectionId: "conn-slack" }))
      .rejects.toMatchObject({ code: "validation_failed" });
  });

  it("refuses an unknown action or missing required mapping", async () => {
    await expect(service().create(USER, {
      name: "Invalid",
      app: "google_calendar",
      actionKey: "missing",
      connectionId: "conn-google",
      triggerSchema,
      actionConfig: {},
    })).rejects.toMatchObject({ code: "validation_failed", status: 422 });
  });

  it("lists and opens only the caller's workflows", async () => {
    const workflowService = service();
    await workflowService.create(USER, {
      name: "Mine",
      app: "google_calendar",
      actionKey: "create_event",
      connectionId: "conn-google",
      triggerSchema,
      actionConfig: validConfig,
    });
    rows.push({ ...rows[0]!, id: "wf-other", userId: OTHER });

    expect(await workflowService.list(USER)).toHaveLength(1);
    expect(await workflowService.get("wf-1", USER)).toMatchObject({ name: "Mine" });
    await expect(workflowService.get("wf-other", USER)).rejects.toMatchObject({ code: "not_found" });
  });
});
