import type { AppliedChangeView } from "@/lib/schemas/change-results";
import { describeResultValue, type RetryOutcome } from "@/lib/result-recovery";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";

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
    detail: "Review the new error, then choose Diagnose if you want ZapFix to analyze it.",
  },
};

interface AppliedChangeResultProps {
  change: AppliedChangeView;
  outcome: RetryOutcome | null;
  restoreState?: "idle" | "confirming" | "conflict" | "restoring" | "restored";
  restoreError?: string | null;
  onRequestRestore?: () => void;
  onCancelRestore?: () => void;
  onConfirmRestore?: (overwrite: boolean) => void;
}

export function AppliedChangeResult({
  change,
  outcome,
  restoreState = "idle",
  restoreError = null,
  onRequestRestore,
  onCancelRestore,
  onConfirmRestore,
}: AppliedChangeResultProps) {
  const result = outcome && outcome !== "running" ? OUTCOME_TEXT[outcome] : null;
  return (
    <section className="space-y-3 rounded-md border p-4" aria-labelledby="applied-change-heading">
      <div className="flex items-center justify-between gap-3"><h3 id="applied-change-heading" className="font-semibold">Change applied</h3><StatusBadge label="Approved change" tone="success" /></div>
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
      <div className="space-y-3 border-t pt-3">
        {restoreState === "restored" ? (
          <Notice tone="success" title="Previous setting restored">Restore changed ZapFix settings only. It did not undo actions already taken in a connected app.</Notice>
        ) : restoreState === "confirming" ? (
          <DialogPanel titleId="restore-confirm-heading" descriptionId="restore-confirm-description" title="Restore the previous setting?" actions={<>
              <Button onClick={() => onConfirmRestore?.(false)}>Confirm restore</Button>
              <Button variant="outline" onClick={onCancelRestore}>Cancel</Button>
            </>}>This restores the previous ZapFix setting. It cannot undo actions already taken in Google Calendar, Gmail, Drive, Slack, or Sheets.</DialogPanel>
        ) : restoreState === "conflict" ? (
          <DialogPanel titleId="restore-conflict-heading" descriptionId="restore-conflict-description" title="This setting was edited by hand" actions={<>
              <Button onClick={() => onConfirmRestore?.(true)}>Overwrite and restore</Button>
              <Button variant="outline" onClick={onCancelRestore}>Keep manual edit</Button>
            </>}>Restoring will overwrite the newer manual edit. Continue only if you want the approved change’s original value restored.</DialogPanel>
        ) : restoreState === "restoring" ? (
          <Button disabled aria-busy="true">Restoring...</Button>
        ) : (
          <Button variant="outline" onClick={onRequestRestore}>Restore previous setting</Button>
        )}
        {restoreError ? <Notice tone="error">{restoreError}</Notice> : null}
      </div>
    </section>
  );
}
