import Link from "next/link";

/** Placeholder home. Visual design comes after the core loop works (Milestone 1). */
export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">ZapFix</h1>
      <p>Scaffold is running. Screens are placeholders until their tasks are built.</p>
      <ul className="list-disc pl-6">
        <li><Link className="underline" href="/sign-in">Sign in (T3)</Link></li>
        <li><Link className="underline" href="/connections">Connections (T16)</Link></li>
        <li><Link className="underline" href="/workflows">Workflows (T17)</Link></li>
      </ul>
    </div>
  );
}
