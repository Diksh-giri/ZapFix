/**
 * Access (module 1, task T3). Only invited testers may sign in (Decision #008).
 * TODO(T3): look up `invites` (status in invited/active); refuse revoked or unknown emails.
 * Public sign-up must also be switched OFF in Supabase.
 */
export async function isInvited(_email: string): Promise<boolean> {
  return false;
}
