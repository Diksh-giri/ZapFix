import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { approvals, configChanges, diagnoses, events, proposals, runs, stepAttempts, workflows } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { confirmProposal } from "@/server/proposals/confirm";
import { createProposal } from "@/server/proposals/create";
import { decideProposal } from "@/server/proposals/decision";
import { createDrizzleProposalStore } from "@/server/proposals/drizzle-store";
import { restoreChange } from "@/server/proposals/restore";
import type { ProposalStore, ProposalTx } from "@/server/proposals/store";
import { buildApprovalSummary, summaryHash } from "@/server/proposals/summary";
import { config, diagnosis, failure } from "../unit/_support/proposal-fixtures";
import { OTHER_USER, USER, db, resetUsers, scratchEnabled, sql } from "./_support/scratch-db";

/** Proposal, confirm and restore against a REAL Postgres, with the real triggers (safety tests 5 and 6). Scratch database only: see _support/scratch-db.ts. */
const WORKFLOW = "10000000-0000-4000-8000-000000000001";
const RUN = "20000000-0000-4000-8000-000000000001";
const ATTEMPT = "30000000-0000-4000-8000-000000000001";
const DIAGNOSIS = "40000000-0000-4000-8000-000000000001";

const enabled = scratchEnabled;
const now = () => new Date();

afterAll(async () => {
  await sql?.end();
});

async function reset() {
  await resetUsers();
  await db!.insert(workflows).values({
    id: WORKFLOW,
    userId: USER,
    name: "wf",
    app: "google_calendar",
    actionKey: "create_event",
    triggerSchema: { fields: [{ key: "email", label: "Email", type: "email" }] },
    actionConfig: config,
  });
  await db!.insert(runs).values({ id: RUN, workflowId: WORKFLOW, userId: USER, triggerData: {}, status: "failed" });
  await db!.insert(stepAttempts).values({
    id: ATTEMPT,
    runId: RUN,
    stepKey: "create_event",
    attemptNo: 1,
    status: "failed",
    configSnapshot: config,
    idempotencyKey: "r:a:1",
    errorStd: { category_hint: "missing_field", code: "missing_required_field", message: "attendee_email is required", retryable: false, outcome: "not_executed" },
  });
  await db!.insert(diagnoses).values({
    id: DIAGNOSIS,
    attemptId: ATTEMPT,
    category: "missing_required_field",
    supported: true,
    ruleEvidence: diagnosis.evidence,
    candidates: diagnosis.candidates,
    confidenceCeiling: "medium",
    aiStatus: "ok",
    aiOutput: diagnosis.ai,
    confidence: "medium",
  });
}

async function newProposal(store: ProposalStore) {
  const made = await createProposal({ store }, { diagnosis: { ...diagnosis, id: DIAGNOSIS }, workflowId: WORKFLOW, config, configVersion: 1 });
  if (!made) throw new Error("expected a proposal");
  return made;
}

const hashFor = (cfg: ActionConfig = config, optionId = "map:attendee_email:contact_email") => {
  const o = diagnosis.candidates.find((c) => c.id === optionId)!;
  return summaryHash(buildApprovalSummary({ failure: { ...failure, originalError: "missing_required_field: attendee_email is required" }, diagnosis, config: cfg, option: { fieldPath: o.fieldPath!, proposedValue: o.proposedValue! } }));
};

/** A store whose transaction throws at the chosen write, to prove Postgres rolls the rest back. */
function failingAt(store: ProposalStore, point: keyof Pick<ProposalTx, "insertApproval" | "insertConfigChange" | "updateWorkflowConfig" | "setProposalStatus" | "markChangeRestored">): ProposalStore {
  return {
    ...store,
    transaction: (fn) =>
      store.transaction((tx) =>
        fn({
          ...tx,
          [point]: async () => {
            throw new Error(`Simulated failure at ${point}`);
          },
        }),
      ),
  };
}

const workflowRow = async () => (await db!.select().from(workflows).where(eq(workflows.id, WORKFLOW)))[0]!;

describe.skipIf(!enabled)("proposals on a real database (scratch only)", () => {
  beforeEach(reset);

  it("confirm applies exactly the approved change and records approval, change and events", async () => {
    const store = createDrizzleProposalStore(db!);
    const p = await newProposal(store);
    const result = await confirmProposal({ store, now }, { proposalId: p.id, userId: USER, expectedConfigVersion: 1, summaryHash: hashFor() });

    const w = await workflowRow();
    expect(w.configVersion).toBe(2);
    expect(w.lastModifiedBy).toBe("debugger");
    expect(w.actionConfig).toEqual({ ...config, attendee_email: { kind: "mapped", source: "contact_email" } });
    const [change] = await db!.select().from(configChanges);
    expect(change).toMatchObject({ id: result.configChangeId, status: "applied", beforeValue: config.attendee_email });
    expect(await db!.select().from(approvals)).toHaveLength(1);
    expect((await db!.select().from(proposals).where(eq(proposals.id, p.id)))[0]!.status).toBe("decided");
    expect((await db!.select().from(events)).map((e) => e.type).sort()).toEqual(["change_applied", "proposal_decided"]);
  });

  it.each(["insertApproval", "insertConfigChange", "updateWorkflowConfig", "setProposalStatus"] as const)(
    "SAFETY TEST 5: a failure at %s leaves no approval, no change and no settings update",
    async (point) => {
      const real = createDrizzleProposalStore(db!);
      const p = await newProposal(real);
      await expect(
        confirmProposal({ store: failingAt(real, point), now }, { proposalId: p.id, userId: USER, expectedConfigVersion: 1, summaryHash: hashFor() }),
      ).rejects.toThrow(/Simulated failure/);

      const w = await workflowRow();
      expect(w.actionConfig).toEqual(config);
      expect(w.configVersion).toBe(1);
      expect(w.lastModifiedBy).toBe("user");
      expect(await db!.select().from(approvals)).toHaveLength(0);
      expect(await db!.select().from(configChanges)).toHaveLength(0);
      expect(await db!.select().from(events)).toHaveLength(0);
      expect((await db!.select().from(proposals).where(eq(proposals.id, p.id)))[0]!.status).toBe("pending");
    },
  );

  it("two simultaneous confirms apply the change once", async () => {
    const store = createDrizzleProposalStore(db!);
    const p = await newProposal(store);
    const input = { proposalId: p.id, userId: USER, expectedConfigVersion: 1, summaryHash: hashFor() };
    const results = await Promise.allSettled([confirmProposal({ store, now }, input), confirmProposal({ store, now }, input)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(AppError);
    expect(await db!.select().from(configChanges)).toHaveLength(1);
    expect((await workflowRow()).configVersion).toBe(2);
  });

  it("refuses another user's proposal and writes nothing", async () => {
    const store = createDrizzleProposalStore(db!);
    const p = await newProposal(store);
    await expect(
      confirmProposal({ store, now }, { proposalId: p.id, userId: OTHER_USER, expectedConfigVersion: 1, summaryHash: hashFor() }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await db!.select().from(approvals)).toHaveLength(0);
  });

  it("reject records the decision and leaves the settings alone", async () => {
    const store = createDrizzleProposalStore(db!);
    const p = await newProposal(store);
    await decideProposal({ store, now }, { proposalId: p.id, userId: USER, decision: "rejected" });
    expect((await workflowRow()).configVersion).toBe(1);
    const [a] = await db!.select().from(approvals);
    expect(a).toMatchObject({ decision: "rejected", approvedFieldPath: null, approvedValue: null });
    await expect(decideProposal({ store, now }, { proposalId: p.id, userId: USER, decision: "exited" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("a new proposal supersedes the pending one", async () => {
    const store = createDrizzleProposalStore(db!);
    const first = await newProposal(store);
    const second = await newProposal(store);
    const status = async (id: string) => (await db!.select().from(proposals).where(eq(proposals.id, id)))[0]!.status;
    expect(await status(first.id)).toBe("superseded");
    expect(await status(second.id)).toBe("pending");
  });

  it("refuses a proposal when the repair limit is reached after diagnosis was saved", async () => {
    const store = createDrizzleProposalStore(db!);
    await db!.update(runs).set({ repairCount: 2 }).where(eq(runs.id, RUN));

    await expect(newProposal(store)).rejects.toMatchObject({ code: "repair_limit_reached" });
    expect(await db!.select().from(proposals)).toHaveLength(0);
  });

  it("refuses a proposal when a newer attempt finishes after diagnosis was saved", async () => {
    const store = createDrizzleProposalStore(db!);
    await db!.insert(stepAttempts).values({
      runId: RUN,
      stepKey: "create_event",
      attemptNo: 2,
      status: "failed",
      configSnapshot: config,
      idempotencyKey: "r:a:2",
      errorStd: {
        category_hint: "missing_field",
        code: "newer_failure",
        message: "A newer attempt failed.",
        retryable: false,
        outcome: "not_executed",
      },
    });

    await expect(newProposal(store)).rejects.toMatchObject({ code: "conflict" });
    expect(await db!.select().from(proposals)).toHaveLength(0);
  });

  it("SAFETY TEST 6: restore returns the exact before value, and a hand edit gives manual_edit_conflict", async () => {
    const store = createDrizzleProposalStore(db!);
    const p = await newProposal(store);
    const applied = await confirmProposal({ store, now }, { proposalId: p.id, userId: USER, expectedConfigVersion: 1, summaryHash: hashFor() });

    // the user edits the same setting by hand
    const edited = { ...config, attendee_email: { kind: "mapped" as const, source: "hand_choice" } };
    await db!.update(workflows).set({ actionConfig: edited, configVersion: 3, lastModifiedBy: "user" }).where(eq(workflows.id, WORKFLOW));

    await expect(restoreChange({ store, now }, { changeId: applied.configChangeId, userId: USER })).rejects.toMatchObject({ code: "manual_edit_conflict" });
    expect((await workflowRow()).actionConfig).toEqual(edited);

    await restoreChange({ store, now }, { changeId: applied.configChangeId, userId: USER, confirmOverwrite: true });
    const w = await workflowRow();
    expect(w.actionConfig).toEqual(config); // the exact original
    expect(w.configVersion).toBe(4);
    const [change] = await db!.select().from(configChanges).where(and(eq(configChanges.id, applied.configChangeId)));
    expect(change).toMatchObject({ status: "restored", beforeValue: config.attendee_email });
    expect(change!.restoredAt).not.toBeNull();
    expect(await db!.select().from(approvals)).toHaveLength(1); // the approval is untouched
  });

  it("restore is all-or-nothing on a real database", async () => {
    const real = createDrizzleProposalStore(db!);
    const p = await newProposal(real);
    const applied = await confirmProposal({ store: real, now }, { proposalId: p.id, userId: USER, expectedConfigVersion: 1, summaryHash: hashFor() });
    const before = await workflowRow();
    await expect(restoreChange({ store: failingAt(real, "markChangeRestored"), now }, { changeId: applied.configChangeId, userId: USER })).rejects.toThrow(/Simulated failure/);
    expect(await workflowRow()).toEqual(before);
    expect((await db!.select().from(configChanges))[0]!.status).toBe("applied");
  });
});
