export type InviteStatus = "invited" | "active" | "revoked";

export interface InviteStore {
  getStatus(email: string): Promise<InviteStatus | null>;
  /** Atomically changes invited -> active and also accepts an already-active invite. */
  activate(email: string): Promise<boolean>;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function defaultStore(): Promise<InviteStore> {
  const [{ db }, { createDrizzleInviteStore }] = await Promise.all([
    import("@/db/client"),
    import("@/server/access/invite-store"),
  ]);
  return createDrizzleInviteStore(db);
}

/** Only invited or active testers may request a sign-in link. */
export async function isInvited(email: string, store?: InviteStore): Promise<boolean> {
  const normalized = normalizeInviteEmail(email);
  if (!normalized) return false;
  const status = await (store ?? (await defaultStore())).getStatus(normalized);
  return status === "invited" || status === "active";
}

/** Called only after Supabase verifies the magic link. */
export async function activateInvite(email: string, store?: InviteStore): Promise<boolean> {
  const normalized = normalizeInviteEmail(email);
  if (!normalized) return false;
  return (store ?? (await defaultStore())).activate(normalized);
}
