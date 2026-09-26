import { describe, expect, it } from "vitest";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { confirmProposal } from "@/server/proposals/confirm";
import { decideProposal } from "@/server/proposals/decision";
import type { FailurePoint, MemoryProposalStore } from "@/server/proposals/memory-store";
import { summaryHash } from "@/server/proposals/summary";
import { DEFAULT_ID, code, config, hashFor, now, setup } from "./_support/proposal-fixtures";

const confirm = (store: MemoryProposalStore, over: Partial<Parameters<typeof confirmProposal>[1]> = {}) =>
  confirmProposal({ store, now }, { proposalId: "prop-1", userId: "user-1", expectedConfigVersion: 4, summaryHash: hashFor(), ...over });

const decide = (store: MemoryProposalStore, decision: "rejected" | "exited" = "rejected", over: { userId?: string; proposalId?: string } = {}) =>
  decideProposal({ store, now }, { proposalId: "prop-1", userId: "user-1", decision, ...over });

/** Nothing about the workflow, approvals, changes or events may differ from the start. */
function expectUntouched(store: MemoryProposalStore, proposalStatus = "pending") {
  expect(store.workflow("wf-1")).toMatchObject({ config, configVersion: 4, lastModifiedBy: "user" });
  expect(store.approvals()).toHaveLength(0);
  expect(store.changes()).toHaveLength(0);
  expect(store.events()).toHaveLength(0);
  expect(store.all().find((p) => p.id === "prop-1")?.status).toBe(proposalStatus);
}

describe("decideProposal (reject or exit; safety test 1: no change without approval)", () => {
  it.each(["rejected", "exited"] as const)("records %s, closes the proposal and changes no setting", async (decision) => {
    const store = setup();
    await expect(decide(store, decision)).resolves.toEqual({ status: "decided" });
    expect(store.approvals()).toHaveLength(1);
    expect(store.approvals()[0]).toMatchObject({
      proposalId: "prop-1",
      userId: "user-1",
      decision,
      approvedFieldPath: null,
      approvedValue: null,
      wasEdited: false,
    });
    expect(store.approvals()[0]!.summaryShown.fieldPath).toBe("actionConfig.attendee_email");
    expect(store.all()[0]!.status).toBe("decided");
    expect(store.changes()).toHaveLength(0);
    expect(store.workflow("wf-1")).toMatchObject({ config, configVersion: 4, lastModifiedBy: "user" });
    expect(store.events().map((e) => e.type)).toEqual(["proposal_decided"]);
    expect(store.events()[0]).toMatchObject({ userId: "user-1", runId: "run-1", payload: { proposal_id: "prop-1", decision } });
  });

  it("gives not_found for an unknown proposal and for someone else's, writing nothing", async () => {
    const store = setup();
    expect(await code(decide(store, "rejected", { proposalId: "nope" }))).toBe("not_found");
    expect(await code(decide(store, "rejected", { userId: "user-2" }))).toBe("not_found");
    expectUntouched(store);
  });

  it("refuses a proposal that is already decided, and only one decision is ever saved", async () => {
    const store = setup();
    await decide(store, "rejected");
    expect(await code(decide(store, "exited"))).toBe("conflict");
    expect(store.approvals()).toHaveLength(1);
  });

  it("calls a superseded or expired proposal outdated", async () => {
    for (const status of ["superseded", "expired"] as const) {
      const store = setup({ proposal: { status } });
      expect(await code(decide(store))).toBe("proposal_outdated");
      expectUntouched(store, status);
    }
  });

  it("has nothing to decide for reconnect guidance", async () => {
    const store = setup({ proposal: { kind: "reconnect_guidance", fieldPath: null, currentValue: null, proposedValue: null, validOptions: [] } });
    expect(await code(decide(store))).toBe("validation_failed");
    expectUntouched(store);
  });

  it("saves nothing if any write fails", async () => {
    for (const point of ["insertApproval", "setProposalStatus", "insertEvent"] as FailurePoint[]) {
      const store = setup();
      store.failAt(point);
      await expect(decide(store)).rejects.toThrow();
      expectUntouched(store);
    }
  });
});

describe("confirmProposal: the approved change", () => {
  it("changes exactly one setting, records the approval and the change, and bumps the version", async () => {
    const store = setup();
    const result = await confirm(store);

    expect(store.workflow("wf-1")).toMatchObject({
      config: { title: config.title, attendee_email: { kind: "mapped", source: "contact_email" } },
      configVersion: 5,
      lastModifiedBy: "debugger",
    });
    expect(result).toMatchObject({ workflow: { id: "wf-1", configVersion: 5 } });

    const [approval] = store.approvals();
    expect(approval).toMatchObject({
      proposalId: "prop-1",
      userId: "user-1",
      decision: "approved",
      approvedFieldPath: "actionConfig.attendee_email",
      approvedValue: { kind: "mapped", source: "contact_email" },
      wasEdited: false,
    });
    expect(summaryHash(approval!.summaryShown)).toBe(hashFor());

    const [change] = store.changes();
    expect(change).toMatchObject({
      workflowId: "wf-1",
      approvalId: approval!.id,
      fieldPath: "actionConfig.attendee_email",
      beforeValue: { kind: "mapped", source: "email" },
      afterValue: { kind: "mapped", source: "contact_email" },
      status: "applied",
    });
    expect(result.approvalId).toBe(approval!.id);
    expect(result.configChangeId).toBe(change!.id);
    expect(store.all()[0]!.status).toBe("decided");
    expect(store.events().map((e) => e.type)).toEqual(["proposal_decided", "change_applied"]);
  });

  it("applies the option the user picked and marks the approval as edited", async () => {
    const store = setup();
    const other = "map:attendee_email:work_email";
    await confirm(store, { selectedOptionId: other, summaryHash: hashFor(other) });
    expect(store.workflow("wf-1")!.config.attendee_email).toEqual({ kind: "mapped", source: "work_email" });
    expect(store.approvals()[0]).toMatchObject({ wasEdited: true, approvedValue: { kind: "mapped", source: "work_email" } });
  });

  it("does not mark it edited when the user picks the option that was already proposed", async () => {
    const store = setup();
    await confirm(store, { selectedOptionId: DEFAULT_ID });
    expect(store.approvals()[0]!.wasEdited).toBe(false);
  });

  it("writes only ids and labels to events, never setting values", async () => {
    const store = setup();
    await confirm(store);
    for (const e of store.events()) {
      expect(JSON.stringify(e.payload)).not.toMatch(/contact_email|work_email|Kickoff/);
    }
  });
});

describe("confirmProposal: what it refuses (nothing is written; safety tests 1 and 2)", () => {
  it("refuses an option that is not in the valid options", async () => {
    const store = setup();
    expect(await code(confirm(store, { selectedOptionId: "map:attendee_email:made_up" }))).toBe("validation_failed");
    expectUntouched(store);
  });

  it("refuses a summary hash that does not match what the server would show", async () => {
    const store = setup();
    expect(await code(confirm(store, { summaryHash: "0".repeat(64) }))).toBe("proposal_outdated");
    // the hash of a different option is also wrong for the default option
    expect(await code(confirm(store, { summaryHash: hashFor("map:attendee_email:work_email") }))).toBe("proposal_outdated");
    expectUntouched(store);
  });

  it("refuses when the screen was loaded at an older settings version", async () => {
    const store = setup();
    expect(await code(confirm(store, { expectedConfigVersion: 3 }))).toBe("proposal_outdated");
    expectUntouched(store);
  });

  it("refuses, and expires the proposal, when the settings were edited by hand after it was made", async () => {
    const store = setup();
    const edited: ActionConfig = { ...config, attendee_email: { kind: "mapped", source: "manual_choice" } };
    store.editByHand("wf-1", edited);
    expect(await code(confirm(store, { expectedConfigVersion: 5, summaryHash: hashFor(DEFAULT_ID, edited) }))).toBe("proposal_outdated");
    expect(store.all()[0]!.status).toBe("expired");
    expect(store.approvals()).toHaveLength(0);
    expect(store.changes()).toHaveLength(0);
    expect(store.workflow("wf-1")).toMatchObject({ config: edited, configVersion: 5, lastModifiedBy: "user" });
  });

  it("refuses a proposal that is decided, superseded or expired", async () => {
    expect(await code(confirm(setup({ proposal: { status: "decided" } })))).toBe("conflict");
    expect(await code(confirm(setup({ proposal: { status: "superseded" } })))).toBe("proposal_outdated");
    expect(await code(confirm(setup({ proposal: { status: "expired" } })))).toBe("proposal_outdated");
  });

  it("gives not_found for an unknown proposal and for someone else's", async () => {
    const store = setup();
    expect(await code(confirm(store, { proposalId: "nope" }))).toBe("not_found");
    expect(await code(confirm(store, { userId: "user-2" }))).toBe("not_found");
    expectUntouched(store);
  });

  it("has nothing to approve for reconnect guidance", async () => {
    const store = setup({ proposal: { kind: "reconnect_guidance", fieldPath: null, currentValue: null, proposedValue: null, validOptions: [] } });
    expect(await code(confirm(store))).toBe("validation_failed");
    expectUntouched(store);
  });

  it("applies once: a second confirm is refused and the version moves only once", async () => {
    const store = setup();
    await confirm(store);
    expect(await code(confirm(store, { expectedConfigVersion: 5 }))).toBe("conflict");
    expect(store.changes()).toHaveLength(1);
    expect(store.approvals()).toHaveLength(1);
    expect(store.workflow("wf-1")!.configVersion).toBe(5);
  });

  it("cannot confirm after the user rejected it", async () => {
    const store = setup();
    await decide(store, "rejected");
    expect(await code(confirm(store))).toBe("conflict");
    expect(store.changes()).toHaveLength(0);
    expect(store.workflow("wf-1")).toMatchObject({ config, configVersion: 4 });
  });
});

describe("confirmProposal is all-or-nothing (safety test 5)", () => {
  it.each(["insertApproval", "insertConfigChange", "updateWorkflowConfig", "setProposalStatus", "insertEvent"] as FailurePoint[])(
    "saves nothing when the write fails at %s",
    async (point) => {
      const store = setup();
      store.failAt(point);
      await expect(confirm(store)).rejects.toThrow();
      expectUntouched(store);
    },
  );

  it("works again once the failure is gone", async () => {
    const store = setup();
    store.failAt("insertConfigChange");
    await expect(confirm(store)).rejects.toThrow();
    store.failAt(null);
    await expect(confirm(store)).resolves.toBeTruthy();
    expect(store.workflow("wf-1")!.configVersion).toBe(5);
  });
});
