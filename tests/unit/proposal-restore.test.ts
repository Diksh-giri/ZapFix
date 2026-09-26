import { describe, expect, it } from "vitest";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { confirmProposal } from "@/server/proposals/confirm";
import type { FailurePoint, MemoryProposalStore } from "@/server/proposals/memory-store";
import { planProposal } from "@/server/proposals/plan";
import { restoreChange } from "@/server/proposals/restore";
import { buildApprovalSummary, summaryHash } from "@/server/proposals/summary";
import type { DiagnosisInput, ProposalRecord } from "@/server/proposals/types";
import { DEFAULT_ID, code, config, diagnosis, failure, hashFor, mapTo, now, setup } from "./_support/proposal-fixtures";

/** Applies the first proposal, so there is one applied change to restore. Returns its id. */
async function applyFirstChange(store: MemoryProposalStore): Promise<string> {
  const done = await confirmProposal(
    { store, now },
    { proposalId: "prop-1", userId: "user-1", expectedConfigVersion: 4, summaryHash: hashFor(DEFAULT_ID) },
  );
  return done.configChangeId;
}

/** A later diagnosis and proposal on the same workflow, applied on top of the first change. */
async function applySecondChange(store: MemoryProposalStore): Promise<string> {
  const current = store.workflow("wf-1")!;
  const second: DiagnosisInput = {
    ...diagnosis,
    id: "diag-2",
    candidates: [mapTo("other_email")],
    ai: { ...diagnosis.ai!, selected_candidate_id: "map:attendee_email:other_email" },
  };
  const draft = planProposal({ diagnosis: second, workflowId: "wf-1", config: current.config, configVersion: current.configVersion })!;
  const proposal: ProposalRecord = { ...draft, id: "prop-2", status: "pending", createdAt: now() };
  store.seed({
    proposal,
    workflow: { id: "wf-1", userId: "user-1", config: current.config, configVersion: current.configVersion },
    diagnosis: second,
    failure,
    runId: "run-1",
  });
  const option = { fieldPath: "actionConfig.attendee_email", proposedValue: mapTo("other_email").proposedValue! };
  const hash = summaryHash(buildApprovalSummary({ failure, diagnosis: second, config: current.config, option }));
  const done = await confirmProposal(
    { store, now },
    { proposalId: "prop-2", userId: "user-1", expectedConfigVersion: current.configVersion, summaryHash: hash },
  );
  return done.configChangeId;
}

const restore = (store: MemoryProposalStore, changeId: string, over: Partial<Parameters<typeof restoreChange>[1]> = {}) =>
  restoreChange({ store, now }, { changeId, userId: "user-1", ...over });

describe("restoreChange: the exact before value comes back", () => {
  it("puts the setting back exactly as it was and marks the change restored", async () => {
    const store = setup();
    const changeId = await applyFirstChange(store);
    const result = await restore(store, changeId);

    expect(store.workflow("wf-1")).toMatchObject({ config, configVersion: 6 });
    expect(result).toMatchObject({ configChangeId: changeId, status: "restored", workflow: { id: "wf-1", configVersion: 6, config } });
    expect(store.changes()[0]).toMatchObject({ id: changeId, status: "restored" });
    expect(store.changes()[0]!.restoredAt).toEqual(now());
    expect(store.events().map((e) => e.type)).toEqual(["proposal_decided", "change_applied", "restore_started", "restore_finished"]);
  });

  it("says plainly that it only reverts ZapFix settings", async () => {
    const store = setup();
    const result = await restore(store, await applyFirstChange(store));
    expect(result.note).toMatch(/ZapFix settings only/i);
    expect(result.note).toMatch(/cannot undo/i);
  });

  it("never touches the approval or deletes the change record", async () => {
    const store = setup();
    const changeId = await applyFirstChange(store);
    const approvalsBefore = store.approvals();
    await restore(store, changeId);
    expect(store.approvals()).toEqual(approvalsBefore);
    expect(store.changes()).toHaveLength(1);
  });

  it("keeps a hand edit to a different setting", async () => {
    const store = setup();
    const changeId = await applyFirstChange(store);
    const edited: ActionConfig = { ...store.workflow("wf-1")!.config, title: { kind: "static", value: "Edited by hand" } };
    store.editByHand("wf-1", edited);
    await restore(store, changeId);
    expect(store.workflow("wf-1")!.config).toEqual({ title: { kind: "static", value: "Edited by hand" }, attendee_email: config.attendee_email });
  });
});

describe("restoreChange: manual edit conflict", () => {
  async function editedByHand() {
    const store = setup();
    const changeId = await applyFirstChange(store);
    const edited: ActionConfig = { ...store.workflow("wf-1")!.config, attendee_email: { kind: "mapped", source: "hand_choice" } };
    store.editByHand("wf-1", edited);
    return { store, changeId, edited };
  }

  it("warns and changes nothing when the same setting was edited by hand", async () => {
    const { store, changeId, edited } = await editedByHand();
    expect(await code(restore(store, changeId))).toBe("manual_edit_conflict");
    expect(store.workflow("wf-1")).toMatchObject({ config: edited, configVersion: 6, lastModifiedBy: "user" });
    expect(store.changes()[0]!.status).toBe("applied");
    // the attempt is counted as started, but never as finished
    expect(store.events().map((e) => e.type)).toEqual(["proposal_decided", "change_applied", "restore_started"]);
  });

  it("restores anyway when the user explicitly confirms the overwrite", async () => {
    const { store, changeId } = await editedByHand();
    await restore(store, changeId, { confirmOverwrite: true });
    expect(store.workflow("wf-1")!.config.attendee_email).toEqual(config.attendee_email);
    expect(store.workflow("wf-1")!.configVersion).toBe(7);
    expect(store.changes()[0]!.status).toBe("restored");
  });
});

describe("restoreChange: most recent first", () => {
  it("refuses to restore an older change while a newer one is still applied", async () => {
    const store = setup();
    const first = await applyFirstChange(store);
    const second = await applySecondChange(store);
    const before = store.workflow("wf-1");
    expect(await code(restore(store, first))).toBe("conflict");
    expect(store.workflow("wf-1")).toEqual(before);

    await restore(store, second);
    expect(store.workflow("wf-1")!.config.attendee_email).toEqual({ kind: "mapped", source: "contact_email" });
    await restore(store, first);
    expect(store.workflow("wf-1")!.config).toEqual(config);
    expect(store.changes().map((c) => c.status)).toEqual(["restored", "restored"]);
  });

  it("refuses a change that was already restored", async () => {
    const store = setup();
    const changeId = await applyFirstChange(store);
    await restore(store, changeId);
    const version = store.workflow("wf-1")!.configVersion;
    expect(await code(restore(store, changeId))).toBe("conflict");
    expect(store.workflow("wf-1")!.configVersion).toBe(version);
  });
});

describe("restoreChange: who and what", () => {
  it("gives not_found for an unknown change and for someone else's, and records nothing", async () => {
    const store = setup();
    const changeId = await applyFirstChange(store);
    const eventsBefore = store.events();
    expect(await code(restore(store, "nope"))).toBe("not_found");
    expect(await code(restoreChange({ store, now }, { changeId, userId: "user-2" }))).toBe("not_found");
    expect(store.events()).toEqual(eventsBefore);
    expect(store.workflow("wf-1")!.configVersion).toBe(5);
  });
});

describe("restoreChange is all-or-nothing", () => {
  it.each(["updateWorkflowConfig", "markChangeRestored", "insertEvent"] as FailurePoint[])(
    "saves nothing when the write fails at %s",
    async (point) => {
      const store = setup();
      const changeId = await applyFirstChange(store);
      const workflow = store.workflow("wf-1");
      const events = store.events();
      store.failAt(point);
      await expect(restore(store, changeId)).rejects.toThrow();
      expect(store.workflow("wf-1")).toEqual(workflow);
      expect(store.changes()[0]!.status).toBe("applied");
      expect(store.events()).toEqual(events);
    },
  );
});
