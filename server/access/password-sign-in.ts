import { z } from "zod";
import { normalizeInviteEmail } from "./invite";

/**
 * Email and password sign-in for invited testers. The accounts are created by the project owner in
 * Supabase (nobody signs up here). This function holds the rules; the server action wires it to Supabase.
 *
 * Order matters: the password is checked FIRST, so a wrong password gives the same answer for an
 * unknown email and a known one, and never reveals who is on the invite list. Only someone who
 * proved their password can learn that their invite is missing or revoked.
 */
export type PasswordSignInResult = "ok" | "invalid_input" | "invalid_credentials" | "not_invited" | "failed";

export interface PasswordSignInDeps {
  /** Asks Supabase to sign in. On success returns the email Supabase has on file. */
  signIn(
    email: string,
    password: string,
  ): Promise<{ ok: true; email: string } | { ok: false; reason: "invalid_credentials" | "failed" }>;
  signOut(): Promise<void>;
  /** invited -> active, or already active. False for revoked and unknown emails. */
  activateInvite(email: string): Promise<boolean>;
}

const InputSchema = z.object({
  email: z.string().trim().email().max(320),
  // Not trimmed: spaces may be part of the password. 72 is Supabase's own upper limit.
  password: z.string().min(1).max(72),
});

export async function passwordSignIn(deps: PasswordSignInDeps, input: { email: unknown; password: unknown }): Promise<PasswordSignInResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return "invalid_input";

  const signedIn = await deps.signIn(normalizeInviteEmail(parsed.data.email), parsed.data.password);
  if (!signedIn.ok) return signedIn.reason;

  try {
    if (await deps.activateInvite(normalizeInviteEmail(signedIn.email))) return "ok";
    await deps.signOut();
    return "not_invited";
  } catch {
    // Could not confirm the invite: never leave a half-checked session behind.
    await deps.signOut().catch(() => {});
    return "failed";
  }
}
