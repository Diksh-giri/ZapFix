"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { activateInvite } from "@/server/access/invite";
import { passwordSignIn, type PasswordSignInResult } from "@/server/access/password-sign-in";
import { safeNextPath } from "@/server/access/redirects";

function signInLocation(code: string): never {
  redirect(`/sign-in?status=${encodeURIComponent(code)}`);
}

async function supabaseForCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

export async function signInWithPassword(formData: FormData): Promise<void> {
  const supabase = await supabaseForCookies();
  if (!supabase) signInLocation("not_configured");

  const result: PasswordSignInResult = await passwordSignIn(
    {
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, reason: error.code === "invalid_credentials" ? "invalid_credentials" : "failed" };
        return data.user?.email ? { ok: true, email: data.user.email } : { ok: false, reason: "failed" };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      activateInvite: (email) => activateInvite(email),
    },
    { email: formData.get("email"), password: formData.get("password") },
  );

  if (result === "ok") redirect(safeNextPath(formData.get("next") as string | null));
  signInLocation(result);
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseForCookies();
  if (supabase) await supabase.auth.signOut();
  redirect("/sign-in?status=signed_out");
}
