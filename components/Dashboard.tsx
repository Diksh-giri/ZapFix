"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Cable, CheckCircle2, Plus, ShieldCheck, Workflow, Wrench } from "lucide-react";
import { loadConnections } from "@/lib/connections-client";
import { loadWorkflows } from "@/lib/workflows-client";
import type { ClientConnection } from "@/lib/schemas/connections";
import type { Workflow as WorkflowView } from "@/lib/schemas/workflows";

type DashboardState = { status: "loading"; workflows: []; connections: [] } | { status: "ready"; workflows: WorkflowView[]; connections: ClientConnection[] } | { status: "error"; workflows: []; connections: [] };

const recoverySteps = [
  ["1", "Run", "Test a workflow with safe test data."],
  ["2", "Understand", "See the failed step and confirmed evidence."],
  ["3", "Approve", "Review the exact change before anything happens."],
  ["4", "Verify", "Retry once, then restore the setting if needed."],
];

function providerLabel(provider: ClientConnection["provider"]): string {
  return provider === "google" ? "Google" : "Slack";
}

export function Dashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading", workflows: [], connections: [] });
  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadWorkflows(), loadConnections()]).then(([workflows, connections]) => {
      if (!cancelled) setState({ status: "ready", workflows, connections });
    }).catch(() => {
      if (!cancelled) setState({ status: "error", workflows: [], connections: [] });
    });
    return () => { cancelled = true; };
  }, []);

  if (state.status === "loading") return <DashboardSkeleton />;
  if (state.status === "error") return <DashboardError onRetry={() => window.location.reload()} />;
  return <DashboardView workflows={state.workflows} connections={state.connections} />;
}

export function DashboardView({ workflows, connections }: { workflows: WorkflowView[]; connections: ClientConnection[] }) {
  const activeConnections = connections.filter((connection) => connection.status === "active");
  const needsReconnect = connections.filter((connection) => connection.status === "needs_reconnect");
  const recent = workflows.slice(0, 3);
  return (
    <div className="space-y-8">
      <section className="border-b border-[#dedbd6] pb-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-[#77736f]">Home</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#2d2e2f] sm:text-4xl">What would you like to fix?</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#595653] sm:text-base">Choose a workflow to test, or connect an app and build a new one. ZapFix keeps every repair reviewable and reversible.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/workflows" className="inline-flex items-center gap-2 rounded-md bg-[#ff4f00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e84700]"><Plus className="size-4" />Create workflow</Link>
            <Link href="/connections" className="inline-flex items-center gap-2 rounded-md border border-[#c9c6c1] bg-white px-4 py-2.5 text-sm font-semibold text-[#2d2e2f] hover:bg-[#f3f1ed]"><Cable className="size-4" />Manage connections</Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="workspace-overview-heading">
        <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-medium text-[#77736f]">At a glance</p><h2 id="workspace-overview-heading" className="mt-1 text-xl font-semibold text-[#2d2e2f]">Your workspace</h2></div></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Metric icon={Workflow} label="Workflows" value={String(workflows.length)} detail={workflows.length === 1 ? "workflow ready to test" : "workflows ready to manage"} />
          <Metric icon={CheckCircle2} label="Active connections" value={String(activeConnections.length)} detail={activeConnections.length ? activeConnections.map((item) => providerLabel(item.provider)).join(" · ") : "Connect an app to begin"} />
          <Metric icon={ShieldCheck} label="Need attention" value={String(needsReconnect.length)} detail={needsReconnect.length ? "Reconnect before the next run" : "Connections look ready"} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
        <section aria-labelledby="recent-workflows-heading" className="rounded-lg border border-[#dedbd6] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-[#77736f]">Continue working</p><h2 id="recent-workflows-heading" className="mt-1 text-xl font-semibold text-[#2d2e2f]">Recent workflows</h2></div><Link href="/workflows" className="inline-flex items-center gap-1 text-sm font-semibold text-[#503eb6] hover:underline">View all <ArrowRight className="size-4" /></Link></div>
          {recent.length ? <ul className="mt-4 divide-y divide-[#ececf2]">{recent.map((workflow) => <li key={workflow.id}><Link href={`/workflows/${workflow.id}`} className="flex items-center justify-between gap-4 py-4 hover:text-[#574bc8]"><div><span className="font-medium">{workflow.name}</span><span className="mt-1 block text-xs text-[#777a91]">{workflow.app.replaceAll("_", " ")} · Version {workflow.configVersion}</span></div><ArrowRight className="size-4 shrink-0" /></Link></li>)}</ul> : <div className="mt-5 rounded-xl border border-dashed border-[#d8d9e5] bg-[#fafafe] p-6 text-center"><Workflow className="mx-auto size-6 text-[#8588a1]" /><p className="mt-3 font-medium">No workflows yet</p><p className="mt-1 text-sm text-[#777a91]">Create one workflow to begin the recovery journey.</p><Link href="/workflows" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#574bc8] hover:underline">Create your first workflow <ArrowRight className="size-4" /></Link></div>}
        </section>

        <section aria-labelledby="recovery-journey-heading" className="rounded-lg border border-[#dedbd6] bg-[#f7f5f2] p-5 sm:p-6">
          <div className="flex items-center gap-2"><Wrench className="size-5 text-[#ff4f00]" /><h2 id="recovery-journey-heading" className="text-lg font-semibold text-[#2d2e2f]">How recovery works</h2></div>
          <ol className="mt-5 space-y-4">{recoverySteps.map(([number, title, detail]) => <li key={number} className="grid grid-cols-[1.75rem_1fr] gap-3"><span className="grid size-7 place-items-center rounded-full bg-white text-xs font-bold text-[#574bc8]">{number}</span><div><p className="text-sm font-semibold text-[#202238]">{title}</p><p className="mt-0.5 text-xs leading-5 text-[#666982]">{detail}</p></div></li>)}</ol>
        </section>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Workflow; label: string; value: string; detail: string }) {
  return <article className="rounded-lg border border-[#dedbd6] bg-white p-5"><div className="flex items-center justify-between"><p className="text-sm font-medium text-[#595653]">{label}</p><span className="grid size-9 place-items-center rounded-md bg-[#f2efeb] text-[#503eb6]"><Icon className="size-4" /></span></div><p className="mt-4 text-3xl font-semibold tracking-tight text-[#2d2e2f]">{value}</p><p className="mt-1 truncate text-xs text-[#77736f]">{detail}</p></article>;
}

function DashboardSkeleton() {
  return <div aria-label="Loading dashboard" role="status" className="space-y-6"><div className="h-64 animate-pulse rounded-3xl bg-[#e7e7f0]" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-[#e7e7f0]" />)}</div><span className="sr-only">Loading dashboard...</span></div>;
}

function DashboardError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6"><h1 className="text-xl font-semibold">Your dashboard could not be loaded</h1><p className="mt-2 text-sm text-[#666982]">Your data is safe. Try loading the page again.</p><button type="button" onClick={onRetry} className="mt-4 rounded-xl bg-[#242342] px-4 py-2 text-sm font-semibold text-white">Try again</button></div>;
}
