"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DiffView } from "@/components/DiffView";
import { EvidenceList } from "@/components/EvidenceList";
import { describeResultValue } from "@/lib/result-recovery";
import type { ApprovalSummaryView } from "@/lib/schemas/proposals";

export function ApprovalDialog({ open, summary, busy = false, error = null, onConfirm, onChooseDifferent, onReject, onExit }: {
  open: boolean;
  summary: ApprovalSummaryView;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onChooseDifferent: () => void;
  onReject: () => void;
  onExit: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="approval-heading" aria-describedby="approval-safety" className="space-y-5 rounded-lg border bg-white p-5">
      <div>
        <h3 ref={heading} tabIndex={-1} id="approval-heading" className="text-lg font-semibold outline-none">Confirm this change</h3>
        <p id="approval-safety" className="mt-1 text-sm font-medium">No change will be made unless you confirm.</p>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-neutral-600">Failed step</dt><dd>{summary.failedStep}</dd>
        <dt className="text-neutral-600">Original error</dt><dd>{summary.originalError}</dd>
        <dt className="text-neutral-600">Likely cause</dt><dd>{summary.likelyCause}</dd>
      </dl>
      <EvidenceList items={summary.evidence} />
      <DiffView field={summary.fieldPath} current={describeResultValue(summary.currentValue)} proposed={describeResultValue(summary.proposedValue)} />
      <div className="space-y-2 text-sm">
        <p><strong>Expected effect:</strong> {summary.expectedEffect}</p>
        {summary.uncertaintyNote ? <p><strong>Uncertainty:</strong> {summary.uncertaintyNote}</p> : null}
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={onConfirm}>{busy ? "Working..." : "Confirm"}</Button>
        <Button variant="outline" disabled={busy} onClick={onChooseDifferent}>Choose a different option</Button>
        <Button variant="outline" disabled={busy} onClick={onReject}>Reject</Button>
        <Button variant="ghost" disabled={busy} onClick={onExit}>Exit</Button>
      </div>
    </div>
  );
}
