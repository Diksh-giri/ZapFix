"use server";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isInvited, normalizeInviteEmail } from "@/server/access/invite";
import { isExistingAuthUserError } from "@/server/access/auth-admin";
import { publicOrigin } from "@/server/access/redirects";

const EmailSchema = z.string().trim().email().max(320);

function signInLocation(code: string): never {
  redirect(`/sign-in?status=${encodeURIComponent(code)}`);
}

export async function requestMagicLink(formData: FormData): Promise<void> {
  const parsed = EmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) signInLocation("invalid_email");

  const email = normalizeInviteEmail(parsed.data);
  if (!(await isInvited(email))) signInLocation("not_invited");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) signInLocation("not_configured");

  // Public signup stays disabled. The server creates an Auth account only after the
  // email passes the application invite gate, then the anon client sends the OTP.
  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { error: createError } = await admin.auth.admin.createUser({ email });
  if (createError && !isExistingAuthUserError(createError)) signInLocation("send_failed");

  const store = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
  const origin = publicOrigin(await headers());
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      shouldCreateUser: false,
    },
  });
  if (error) signInLocation("send_failed");
  signInLocation("sent");
}

export async function signOut(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const store = await cookies();
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
      },
    });
    await supabase.auth.signOut();
  }
  redirect("/sign-in?status=signed_out");
}
