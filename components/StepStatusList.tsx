import type { AttemptStatus } from "@/lib/types";

const TEXT: Record<AttemptStatus, string> = {
  running: "Running...",
  succeeded: "Succeeded",
  failed: "Failed",
  uncertain: "Outcome uncertain: check the app before retrying",
};

export function StepStatusList({ steps }: { steps: Array<{ key: string; label: string; status: AttemptStatus }> }) {
  return (
    <ol className="space-y-1 text-sm">
      {steps.map((s) => (
        <li key={s.key}>
          {s.label}: <strong>{TEXT[s.status]}</strong>
        </li>
      ))}
    </ol>
  );
}
