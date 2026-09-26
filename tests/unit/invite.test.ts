import { describe, expect, it } from "vitest";
import { activateInvite, isInvited, normalizeInviteEmail, type InviteStore } from "@/server/access/invite";

function storeWith(statusByEmail: Record<string, "invited" | "active" | "revoked">): InviteStore {
  return {
    async getStatus(email) {
      return statusByEmail[email] ?? null;
    },
    async activate(email) {
      const status = statusByEmail[email];
      if (status !== "invited" && status !== "active") return false;
      statusByEmail[email] = "active";
      return true;
    },
  };
}

describe("invite access", () => {
  it("normalizes email before looking it up", async () => {
    const store = storeWith({ "tester@example.com": "invited" });
    expect(normalizeInviteEmail("  Tester@Example.COM ")).toBe("tester@example.com");
    await expect(isInvited("  Tester@Example.COM ", store)).resolves.toBe(true);
  });

  it("allows invited and active emails", async () => {
    const store = storeWith({ "invited@example.com": "invited", "active@example.com": "active" });
    await expect(isInvited("invited@example.com", store)).resolves.toBe(true);
    await expect(isInvited("active@example.com", store)).resolves.toBe(true);
  });

  it("refuses revoked and unknown emails", async () => {
    const store = storeWith({ "revoked@example.com": "revoked" });
    await expect(isInvited("revoked@example.com", store)).resolves.toBe(false);
    await expect(isInvited("unknown@example.com", store)).resolves.toBe(false);
  });

  it("activates an invited email after verified sign-in", async () => {
    const statuses: Record<string, "invited" | "active" | "revoked"> = { "tester@example.com": "invited" };
    const store = storeWith(statuses);
    await expect(activateInvite("Tester@example.com", store)).resolves.toBe(true);
    expect(statuses["tester@example.com"]).toBe("active");
  });

  it("cannot activate a revoked or unknown email", async () => {
    const store = storeWith({ "revoked@example.com": "revoked" });
    await expect(activateInvite("revoked@example.com", store)).resolves.toBe(false);
    await expect(activateInvite("unknown@example.com", store)).resolves.toBe(false);
  });
});
