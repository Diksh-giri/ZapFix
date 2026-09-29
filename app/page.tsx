import Link from "next/link";
import { Dashboard } from "@/components/Dashboard";
import { getSessionUser } from "@/server/access/session";

export default async function Home() {
  const user = await getSessionUser();
  if (user) return <Dashboard />;
  return (
    <div className="grid min-h-[calc(100vh-8rem)] items-center gap-10 py-10 lg:grid-cols-[1.1fr_.9fr]">
      <section><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff4f00]">Human-approved workflow recovery</p><h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.03em] text-[#2d2e2f] sm:text-5xl">Fix broken workflows without guessing.</h1><p className="mt-5 max-w-xl text-base leading-7 text-[#595653]">ZapFix finds the failed step, explains what happened, and shows one exact change for you to review. Nothing changes until you approve it.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/sign-in" className="rounded-md bg-[#ff4f00] px-5 py-3 text-sm font-semibold text-white hover:bg-[#e84700]">Sign in to ZapFix</Link><Link href="/connections" className="rounded-md border border-[#c9c6c1] bg-white px-5 py-3 text-sm font-semibold text-[#2d2e2f] hover:bg-[#f3f1ed]">View connections</Link></div><p className="mt-4 text-xs text-[#77736f]">Invite-only testing · Real integrations · Reversible settings</p></section>
      <section aria-label="ZapFix recovery promise" className="rounded-lg border border-[#dedbd6] bg-white p-6 sm:p-8"><p className="text-sm font-semibold text-[#ff4f00]">A safer way to recover</p><ol className="mt-6 space-y-5">{[["01", "See the real failure", "ZapFix shows the failed step and sanitized app error."], ["02", "Review one exact change", "System evidence stays separate from AI-generated explanation."], ["03", "Stay in control", "Approve, reject, retry, or restore. No automatic changes."]].map(([number, title, detail]) => <li key={number} className="grid grid-cols-[2.5rem_1fr] gap-4"><span className="font-mono text-sm text-[#ff4f00]">{number}</span><div><h2 className="font-semibold text-[#2d2e2f]">{title}</h2><p className="mt-1 text-sm leading-6 text-[#595653]">{detail}</p></div></li>)}</ol></section>
    </div>
  );
}
