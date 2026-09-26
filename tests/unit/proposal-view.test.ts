import { describe, expect, it } from "vitest";
import { confirmProposal } from "@/server/proposals/confirm";
import { buildProposalView } from "@/server/proposals/view";
import { DEFAULT_ID, now, setup } from "./_support/proposal-fixtures";

async function contextOf(store: ReturnType<typeof setup>) {
  const ctx = await store.getContext("prop-1", "user-1");
  if (!ctx) throw new Error("expected a context");
  return ctx;
}

describe("buildProposalView", () => {
  it("lists every valid option with its own summary and hash, and marks the proposed one", async () => {
    const view = buildProposalView(await contextOf(setup()));
    expect(view).toMatchObject({ id: "prop-1", kind: "config_change", status: "pending", baseConfigVersion: 4 });
    expect(view.options.map((o) => [o.id, o.isDefault])).toEqual([
      ["map:attendee_email:contact_email", true],
      ["map:attendee_email:work_email", false],
    ]);
    const [a, b] = view.options;
    expect(a!.summaryHash).toHaveLength(64);
    expect(a!.summaryHash).not.toBe(b!.summaryHash);
    expect(a!.summary).toMatchObject({ fieldPath: "actionConfig.attendee_email", proposedValue: { kind: "mapped", source: "contact_email" } });
  });

  it("gives hashes that confirm accepts, for the default and for another option (no drift)", async () => {
    for (const pick of [0, 1]) {
      const store = setup();
      const opt = buildProposalView(await contextOf(store)).options[pick]!;
      await expect(
        confirmProposal(
          { store, now },
          { proposalId: "prop-1", userId: "user-1", selectedOptionId: pick === 0 ? undefined : opt.id, expectedConfigVersion: 4, summaryHash: opt.summaryHash },
        ),
      ).resolves.toBeTruthy();
    }
  });

  it("has no options for reconnect guidance", async () => {
    const store = setup({ proposal: { kind: "reconnect_guidance", fieldPath: null, currentValue: null, proposedValue: null, validOptions: [] } });
    expect(buildProposalView(await contextOf(store)).options).toEqual([]);
  });

  it("does not expose the default option id when none matches (never guesses)", async () => {
    const view = buildProposalView(await contextOf(setup()));
    expect(view.options.filter((o) => o.isDefault)).toHaveLength(1);
    expect(DEFAULT_ID).toBe(view.options.find((o) => o.isDefault)!.id);
  });
});
