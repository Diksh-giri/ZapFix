import { getSessionUser } from "@/server/access/session";
import { requestMagicLink, signOut } from "./actions";

const messages: Record<string, { tone: string; text: string }> = {
  sent: { tone: "text-green-700", text: "Check your email for a secure sign-in link." },
  signed_out: { tone: "text-neutral-700", text: "You have been signed out." },
  invalid_email: { tone: "text-red-700", text: "Enter a valid email address." },
  not_invited: { tone: "text-red-700", text: "This email is not currently invited to ZapFix." },
  not_configured: { tone: "text-red-700", text: "Sign-in is not configured yet. Contact the project owner." },
  send_failed: { tone: "text-red-700", text: "We could not send the sign-in link. Please try again." },
  invalid_link: { tone: "text-red-700", text: "This sign-in link is invalid or has expired. Request a new one." },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ status }, user] = await Promise.all([searchParams, getSessionUser()]);
  const message = status ? messages[status] : undefined;

  return (
    <div className="mx-auto max-w-md space-y-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in to ZapFix</h1>
        <p className="text-sm text-neutral-600">Use the email address that was invited to the test.</p>
      </div>

      {message ? <p className={`rounded-md bg-neutral-100 p-3 text-sm ${message.tone}`}>{message.text}</p> : null}

      {user ? (
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">Signed in as {user.email}</p>
          <form action={signOut}>
            <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50" type="submit">
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <form action={requestMagicLink} className="space-y-4">
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
          <button className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800" type="submit">
            Email me a sign-in link
          </button>
        </form>
      )}

      <p className="text-xs leading-5 text-neutral-500">
        ZapFix sends a one-time link. You do not need a password, and only invited testers can sign in.
      </p>
    </div>
  );
}
