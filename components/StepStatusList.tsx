import type { AttemptStatus } from "@/lib/types";

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
        <li key={s.key} className="rounded-md border border-neutral-200 p-3">
          <p><strong>{s.label}</strong></p>
          <p>Status: <strong>{TEXT[s.status]}</strong></p>
          {s.detail ? <p className="mt-1 text-neutral-600">{s.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}
