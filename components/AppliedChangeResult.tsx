import type { AppliedChangeView } from "@/lib/schemas/change-results";
import { describeResultValue, type RetryOutcome } from "@/lib/result-recovery";

const OUTCOME_TEXT: Record<Exclude<RetryOutcome, "running">, { heading: string; detail: string }> = {
  resolved: {
    heading: "The retry succeeded",
    detail: "The original error did not occur again.",
  },
  same_error: {
    heading: "The same error occurred again",
    detail: "The approved change did not resolve this failure.",
  },
  new_error: {
    heading: "The retry produced a different error",
    detail: "ZapFix started a new diagnosis for the new failure.",
  },
};

export function AppliedChangeResult({ change, outcome }: { change: AppliedChangeView; outcome: RetryOutcome | null }) {
  const result = outcome && outcome !== "running" ? OUTCOME_TEXT[outcome] : null;
  return (
    <section className="space-y-3 rounded-md border p-4" aria-labelledby="applied-change-heading">
      <h3 id="applied-change-heading" className="font-semibold">Change applied</h3>
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-600">Setting</dt><dd>{change.fieldPath}</dd>
        <dt className="text-neutral-600">Original</dt><dd>{describeResultValue(change.originalValue)}</dd>
        <dt className="text-neutral-600">Updated</dt><dd>{describeResultValue(change.updatedValue)}</dd>
        <dt className="text-neutral-600">Approval record</dt><dd>{change.approvalId}</dd>
      </dl>
      {outcome === "running" ? <p role="status" className="text-sm font-medium">Checking the retry result...</p> : null}
      {result ? (
        <div role="status" className="space-y-1 border-t pt-3">
          <p className="font-medium">{result.heading}</p>
          <p className="text-sm text-neutral-600">{result.detail}</p>
        </div>
      ) : null}
    </section>
  );
}
