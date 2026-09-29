import type { AttemptStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";

const TEXT: Record<AttemptStatus, string> = {
  running: "Running...",
  succeeded: "Succeeded",
  failed: "Failed",
  uncertain: "Outcome uncertain: check the app before retrying",
};

export interface DisplayStep {
  key: string;
  label: string;
  status: AttemptStatus;
  detail?: string;
}

export function StepStatusList({ steps }: { steps: DisplayStep[] }) {
  return (
    <ol className="space-y-3 text-sm" aria-label="Workflow steps">
      {steps.map((s) => (
        <li key={s.key} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2"><p><strong>{s.label}</strong></p><StatusBadge label={TEXT[s.status]} tone={s.status === "succeeded" ? "success" : s.status === "failed" ? "error" : s.status === "uncertain" ? "warning" : "active"} /></div>
          <p className="sr-only">Status: <strong>{TEXT[s.status]}</strong></p>
          {s.detail ? <p className="mt-1 text-neutral-600">{s.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}
