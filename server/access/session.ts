import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export interface SessionUser {
  id: string;
  email: string;
}

/** Reads the signed-in user from the Supabase session cookie. Returns null if not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null; // not configured yet (T2/T3)

  const store = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: cookie writes are ignored there
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
}
