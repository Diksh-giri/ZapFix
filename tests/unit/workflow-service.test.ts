import { describe, expect, it } from "vitest";
import { fakeAdapter } from "@/server/adapters/fake";
import { createWorkflowService } from "@/server/workflows/service";

describe("workflow service catalog", () => {
  it("returns only the public adapter catalog fields", () => {
    const service = createWorkflowService({ listAdapters: () => [fakeAdapter] });

    expect(service.listApps()).toEqual([
      {
        id: "google_calendar",
        provider: "google",
        actions: fakeAdapter.actions,
      },
    ]);
  });

  it("does not expose adapter execution functions", () => {
    const service = createWorkflowService({ listAdapters: () => [fakeAdapter] });
    const [app] = service.listApps();

    expect(app).not.toHaveProperty("execute");
    expect(app).not.toHaveProperty("validateConfig");
  });
});
