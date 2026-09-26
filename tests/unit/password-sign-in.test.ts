import { describe, expect, it, vi } from "vitest";
import { passwordSignIn, type PasswordSignInDeps } from "@/server/access/password-sign-in";

function deps(over: Partial<PasswordSignInDeps> = {}): PasswordSignInDeps & {
  signIn: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  activateInvite: ReturnType<typeof vi.fn>;
} {
  return {
    signIn: vi.fn(async () => ({ ok: true as const, email: "tester@example.com" })),
    signOut: vi.fn(async () => {}),
    activateInvite: vi.fn(async () => true),
    ...over,
  } as never;
}

describe("passwordSignIn", () => {
  it("signs in an invited tester and activates the invite", async () => {
    const d = deps();
    await expect(passwordSignIn(d, { email: "  Tester@Example.com ", password: "correct horse" })).resolves.toBe("ok");
    expect(d.signIn).toHaveBeenCalledWith("tester@example.com", "correct horse");
    expect(d.activateInvite).toHaveBeenCalledWith("tester@example.com");
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it("does not trim or change the password", async () => {
    const d = deps();
    await passwordSignIn(d, { email: "tester@example.com", password: "  spaced  " });
    expect(d.signIn).toHaveBeenCalledWith("tester@example.com", "  spaced  ");
  });

  it.each([
    ["no email", { email: "", password: "x" }],
    ["a bad email", { email: "not-an-email", password: "x" }],
    ["no password", { email: "tester@example.com", password: "" }],
    ["a non-text password", { email: "tester@example.com", password: null }],
    ["a missing form", { email: undefined, password: undefined }],
    ["a huge password", { email: "tester@example.com", password: "x".repeat(1000) }],
  ])("rejects %s without contacting Supabase", async (_why, input) => {
    const d = deps();
    await expect(passwordSignIn(d, input)).resolves.toBe("invalid_input");
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("gives one answer for a wrong password and an unknown email, and checks no invite", async () => {
    const d = deps({ signIn: vi.fn(async () => ({ ok: false as const, reason: "invalid_credentials" as const })) });
    await expect(passwordSignIn(d, { email: "who@example.com", password: "wrong" })).resolves.toBe("invalid_credentials");
    expect(d.activateInvite).not.toHaveBeenCalled();
  });

  it("reports a Supabase outage or rate limit as a general failure", async () => {
    const d = deps({ signIn: vi.fn(async () => ({ ok: false as const, reason: "failed" as const })) });
    await expect(passwordSignIn(d, { email: "tester@example.com", password: "x" })).resolves.toBe("failed");
  });

  it("signs out again when the right password belongs to someone who is not invited or was revoked", async () => {
    const d = deps({ activateInvite: vi.fn(async () => false) });
    await expect(passwordSignIn(d, { email: "tester@example.com", password: "x" })).resolves.toBe("not_invited");
    expect(d.signOut).toHaveBeenCalledTimes(1);
  });

  it("checks the invite using the email Supabase confirmed, not the typed one", async () => {
    const d = deps({ signIn: vi.fn(async () => ({ ok: true as const, email: "canonical@example.com" })) });
    await passwordSignIn(d, { email: "Canonical@Example.com", password: "x" });
    expect(d.activateInvite).toHaveBeenCalledWith("canonical@example.com");
  });

  it("signs out and reports failure if the invite lookup itself breaks", async () => {
    const d = deps({
      activateInvite: vi.fn(async () => {
        throw new Error("database down");
      }),
    });
    await expect(passwordSignIn(d, { email: "tester@example.com", password: "x" })).resolves.toBe("failed");
    expect(d.signOut).toHaveBeenCalledTimes(1);
  });
});
