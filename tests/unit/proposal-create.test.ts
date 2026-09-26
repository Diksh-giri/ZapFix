import { describe, expect, it } from "vitest";
import { planProposal } from "@/server/proposals/plan";
import { createProposal } from "@/server/proposals/create";
import { createMemoryProposalStore } from "@/server/proposals/memory-store";
import type { DiagnosisInput } from "@/server/proposals/types";
import type { Candidate } from "@/server/diagnosis/rules/types";
import type { ActionConfig } from "@/lib/schemas/workflow-config";

const config: ActionConfig = {
  title: { kind: "static", value: "Kickoff" },
  attendee_email: { kind: "mapped", source: "email" },
};

const mapTo = (source: string): Candidate => ({
  id: `map:attendee_email:${source}`,
  kind: "config_change",
  fieldPath: "actionConfig.attendee_email",
  proposedValue: { kind: "mapped", source },
  description: `Use "${source}" for Attendee email`,
});

function diagnosisWith(over: Partial<DiagnosisInput> = {}, selected: string | null = "map:attendee_email:contact_email"): DiagnosisInput {
  return {
    id: "diag-1",
    category: "missing_required_field",
    supported: true,
    evidence: [{ label: "Failing field", value: "Attendee email" }],
    candidates: [mapTo("contact_email"), mapTo("work_email")],
    ceiling: "medium",
    aiStatus: "ok",
    ai: {
      likely_cause: "The email field was empty.",
      explanation: "The form's email box had no value.",
      selected_candidate_id: selected,
      why_this_fix: "Contact email has a value.",
      confidence: "medium",
      uncertainty_note: null,
    },
    confidence: "medium",
    ...over,
  };
}

const plan = (d: DiagnosisInput, c: ActionConfig = config) =>
  planProposal({ diagnosis: d, workflowId: "wf-1", config: c, configVersion: 4 });

describe("planProposal: when a fix is offered", () => {
  it("offers the fix the AI picked, with the other allowed options to choose from", () => {
    const p = plan(diagnosisWith());
    expect(p).not.toBeNull();
    expect(p).toMatchObject({
      diagnosisId: "diag-1",
      workflowId: "wf-1",
      kind: "config_change",
      fieldPath: "actionConfig.attendee_email",
      currentValue: { kind: "mapped", source: "email" },
      proposedValue: { kind: "mapped", source: "contact_email" },
      baseConfigVersion: 4,
    });
    expect(p!.validOptions.map((o) => o.id)).toEqual(["map:attendee_email:contact_email", "map:attendee_email:work_email"]);
    expect(p!.expectedEffect).toMatch(/may fix/i);
  });

  it("offers reconnect guidance with no field, no values and no options to approve", () => {
    const reconnect: Candidate = { id: "reconnect", kind: "reconnect_guidance", description: "Reconnect Google" };
    const p = plan(
      diagnosisWith({ category: "expired_connection", candidates: [reconnect], ceiling: "high", confidence: "high" }, "reconnect"),
    );
    expect(p).toMatchObject({ kind: "reconnect_guidance", fieldPath: null, currentValue: null, proposedValue: null, validOptions: [] });
  });
});

describe("planProposal: when NO fix is offered", () => {
  it.each([
    ["the failure is unsupported", { supported: false, category: "unsupported" as const }],
    ["the AI was unavailable", { aiStatus: "unavailable" as const, ai: null, confidence: null }],
    ["the AI answer was invalid", { aiStatus: "invalid" as const, ai: null, confidence: null }],
    ["confidence is low", { confidence: "low" as const }],
    ["the rules' ceiling is low", { ceiling: "low" as const }],
    ["there is no confidence", { confidence: null }],
    ["confidence is above the rules' ceiling", { ceiling: "medium" as const, confidence: "high" as const }],
    ["there are no candidates", { candidates: [] }],
  ])("returns nothing when %s", (_why, over) => {
    expect(plan(diagnosisWith(over))).toBeNull();
  });

  it("returns nothing when the AI chose no candidate", () => {
    expect(plan(diagnosisWith({}, null))).toBeNull();
  });

  it("returns nothing when the AI chose something that is not on the list", () => {
    expect(plan(diagnosisWith({}, "map:attendee_email:made_up"))).toBeNull();
  });

  it("returns nothing when the chosen fix would not change anything", () => {
    expect(plan(diagnosisWith({}, "map:attendee_email:contact_email"), { ...config, attendee_email: { kind: "mapped", source: "contact_email" } })).toBeNull();
  });

  it("drops candidates it cannot trust instead of repairing them", () => {
    const bad: Candidate[] = [
      { id: "bad-path", kind: "config_change", fieldPath: "trigger.email", proposedValue: { kind: "mapped", source: "x" }, description: "x" },
      { id: "bad-value", kind: "config_change", fieldPath: "actionConfig.attendee_email", proposedValue: { kind: "nope" } as never, description: "x" },
      { id: "no-value", kind: "config_change", fieldPath: "actionConfig.attendee_email", description: "x" },
    ];
    expect(plan(diagnosisWith({ candidates: bad }, "bad-path"))).toBeNull();
    expect(plan(diagnosisWith({ candidates: bad }, "bad-value"))).toBeNull();
    expect(plan(diagnosisWith({ candidates: bad }, "no-value"))).toBeNull();

    // A bad candidate beside a good one never reaches the option list.
    const p = plan(diagnosisWith({ candidates: [...bad, mapTo("contact_email")] }));
    expect(p!.validOptions.map((o) => o.id)).toEqual(["map:attendee_email:contact_email"]);
  });
});

describe("createProposal", () => {
  it("saves the proposal as pending", async () => {
    const store = createMemoryProposalStore();
    const made = await createProposal({ store }, { diagnosis: diagnosisWith(), workflowId: "wf-1", config, configVersion: 4 });
    expect(made).toMatchObject({ status: "pending", kind: "config_change", baseConfigVersion: 4 });
    expect(store.all()).toHaveLength(1);
  });

  it("replaces the older pending proposal for the same workflow", async () => {
    const store = createMemoryProposalStore();
    const first = await createProposal({ store }, { diagnosis: diagnosisWith(), workflowId: "wf-1", config, configVersion: 4 });
    const second = await createProposal({ store }, { diagnosis: diagnosisWith({ id: "diag-2" }), workflowId: "wf-1", config, configVersion: 4 });
    const byId = new Map(store.all().map((p) => [p.id, p.status]));
    expect(byId.get(first!.id)).toBe("superseded");
    expect(byId.get(second!.id)).toBe("pending");
  });

  it("leaves other workflows alone and does not touch decided proposals", async () => {
    const store = createMemoryProposalStore();
    const other = await createProposal({ store }, { diagnosis: diagnosisWith(), workflowId: "wf-2", config, configVersion: 1 });
    const decided = await createProposal({ store }, { diagnosis: diagnosisWith(), workflowId: "wf-1", config, configVersion: 4 });
    store.setStatus(decided!.id, "decided");
    await createProposal({ store }, { diagnosis: diagnosisWith({ id: "diag-3" }), workflowId: "wf-1", config, configVersion: 4 });
    const byId = new Map(store.all().map((p) => [p.id, p.status]));
    expect(byId.get(other!.id)).toBe("pending");
    expect(byId.get(decided!.id)).toBe("decided");
  });

  it("still retires the old pending proposal when the new diagnosis offers no fix", async () => {
    const store = createMemoryProposalStore();
    const first = await createProposal({ store }, { diagnosis: diagnosisWith(), workflowId: "wf-1", config, configVersion: 4 });
    const none = await createProposal({ store }, { diagnosis: diagnosisWith({ confidence: "low" }), workflowId: "wf-1", config, configVersion: 4 });
    expect(none).toBeNull();
    expect(store.all().find((p) => p.id === first!.id)?.status).toBe("superseded");
    expect(store.all()).toHaveLength(1);
  });
});
