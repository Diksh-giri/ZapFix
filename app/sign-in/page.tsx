import { getSessionUser } from "@/server/access/session";
import { signInWithPassword, signOut } from "./actions";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";

const messages: Record<string, { tone: "success" | "error"; text: string }> = {
  signed_out: { tone: "success", text: "You have been signed out." },
  invalid_input: { tone: "error", text: "Enter your email address and your password." },
  invalid_credentials: { tone: "error", text: "That email or password is not right." },
  not_invited: { tone: "error", text: "This account is not currently invited to ZapFix." },
  not_configured: { tone: "error", text: "Sign-in is not configured yet. Contact the project owner." },
  failed: { tone: "error", text: "We could not sign you in. Please try again in a moment." },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; next?: string }> }) {
  const [{ status, next }, user] = await Promise.all([searchParams, getSessionUser()]);
  const message = status ? messages[status] : undefined;

  return (
    <div className="mx-auto max-w-md space-y-6 py-6 sm:py-12">
      <PageHeader eyebrow="Account" title="Sign in to ZapFix" description="Use the email address and password the project owner gave you." />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {user ? (
        <Surface className="space-y-4">
          <p className="text-sm text-neutral-700">Signed in as {user.email}</p>
          <form action={signOut}>
            <Button variant="outline" type="submit">Sign out</Button>
          </form>
        </Surface>
      ) : (
        <Surface><form action={signInWithPassword} className="space-y-4">
          <input name="next" type="hidden" value={next ?? ""} />
          <label className="block space-y-2 text-sm font-medium" htmlFor="email">
            Email address
            <input
              autoComplete="email"
              className="block w-full rounded-md border border-neutral-300 px-3 py-2 font-normal outline-none focus:border-blue-600"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium" htmlFor="password">
            Password
            <input
              autoComplete="current-password"
              className="block w-full rounded-md border border-neutral-300 px-3 py-2 font-normal outline-none focus:border-blue-600"
              id="password"
              name="password"
              required
              type="password"
            />
          </label>
          <Button className="w-full" type="submit">Sign in</Button>
        </form></Surface>
      )}

      <p className="text-xs leading-5 text-neutral-500">Only invited testers can sign in. Accounts are created by the project owner.</p>
    </div>
  );
}
