import { getSessionUser } from "@/server/access/session";
import { signInWithPassword, signOut } from "./actions";

const messages: Record<string, { tone: string; text: string }> = {
  signed_out: { tone: "text-neutral-700", text: "You have been signed out." },
  invalid_input: { tone: "text-red-700", text: "Enter your email address and your password." },
  invalid_credentials: { tone: "text-red-700", text: "That email or password is not right." },
  not_invited: { tone: "text-red-700", text: "This account is not currently invited to ZapFix." },
  not_configured: { tone: "text-red-700", text: "Sign-in is not configured yet. Contact the project owner." },
  failed: { tone: "text-red-700", text: "We could not sign you in. Please try again in a moment." },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; next?: string }> }) {
  const [{ status, next }, user] = await Promise.all([searchParams, getSessionUser()]);
  const message = status ? messages[status] : undefined;

  return (
    <div className="mx-auto max-w-md space-y-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in to ZapFix</h1>
        <p className="text-sm text-neutral-600">Use the email address and password the project owner gave you.</p>
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
        <form action={signInWithPassword} className="space-y-4">
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
          <button className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800" type="submit">
            Sign in
          </button>
        </form>
      )}

      <p className="text-xs leading-5 text-neutral-500">Only invited testers can sign in. Accounts are created by the project owner.</p>
    </div>
  );
}
