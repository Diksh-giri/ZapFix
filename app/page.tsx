import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">ZapFix</h1>
      <p>Connect a test account, build a workflow, and run it safely.</p>
      <ul className="list-disc pl-6">
        <li><Link className="underline" href="/sign-in">Sign in (T3)</Link></li>
        <li><Link className="underline" href="/connections">Connections</Link></li>
        <li><Link className="underline" href="/workflows">Workflows</Link></li>
      </ul>
    </div>
  );
}
