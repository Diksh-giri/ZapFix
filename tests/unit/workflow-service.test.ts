import { beforeEach, describe, expect, it } from "vitest";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { fakeAdapter } from "@/server/adapters/fake";
import {
  createWorkflowService,
  type WorkflowRecord,
  type WorkflowStore,
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
let expiredFor: string[];

function memoryStore(): WorkflowStore {
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
    async update(input) {
      const row = rows.find((item) => item.id === input.id && item.userId === input.userId);
      if (!row) return "not_found";
      if (row.configVersion !== input.expectedConfigVersion) return "version_conflict";
      if (input.name !== undefined) row.name = input.name;
      if (input.actionConfig !== undefined) row.actionConfig = input.actionConfig;
      row.configVersion += 1;
      row.lastModifiedBy = "user";
      expiredFor.push(row.id);
      return row;
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
  expiredFor = [];
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

describe("workflow service update", () => {
  async function createWorkflow() {
    return service().create(USER, {
      name: "Before",
      app: "google_calendar",
      actionKey: "create_event",
      connectionId: "conn-google",
      triggerSchema,
      actionConfig: validConfig,
    });
  }

  it("updates at the expected version and expires pending proposals", async () => {
    const created = await createWorkflow();

    const updated = await service().update(created.id, USER, {
      name: "After",
      expectedConfigVersion: 1,
    });

    expect(updated).toMatchObject({
      name: "After",
      configVersion: 2,
      lastModifiedBy: "user",
    });
    expect(expiredFor).toEqual([created.id]);
  });

  it("reports a version conflict without changing or expiring anything", async () => {
    const created = await createWorkflow();

    await expect(service().update(created.id, USER, {
      name: "After",
      expectedConfigVersion: 2,
    })).rejects.toMatchObject({ code: "version_conflict", status: 409 });

    expect(created).toMatchObject({ name: "Before", configVersion: 1 });
    expect(expiredFor).toEqual([]);
  });

  it("validates a replacement action configuration before updating", async () => {
    const created = await createWorkflow();

    await expect(service().update(created.id, USER, {
      actionConfig: {},
      expectedConfigVersion: 1,
    })).rejects.toMatchObject({ code: "validation_failed", status: 422 });

    expect(created.actionConfig).toEqual(validConfig);
    expect(expiredFor).toEqual([]);
  });

  it("does not reveal or update another user's workflow", async () => {
    const created = await createWorkflow();

    await expect(service().update(created.id, OTHER, {
      name: "Stolen",
      expectedConfigVersion: 1,
    })).rejects.toMatchObject({ code: "not_found", status: 404 });

    expect(created.name).toBe("Before");
  });
});
