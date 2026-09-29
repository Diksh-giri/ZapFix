"use client";

import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Notice } from "@/components/ui/notice";
import { DiffView } from "@/components/DiffView";
import { EvidenceList } from "@/components/EvidenceList";
import { describeResultValue } from "@/lib/result-recovery";
import type { ApprovalSummaryView } from "@/lib/schemas/proposals";

export function ApprovalDialog({ open, summary, busy = false, error = null, returnFocusRef, onConfirm, onChooseDifferent, onReject, onExit }: {
  open: boolean;
  summary: ApprovalSummaryView;
  busy?: boolean;
  error?: string | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onChooseDifferent: () => void;
  onReject: () => void;
  onExit: () => void;
}) {
  if (!open) return null;
  return (
    <DialogPanel
      titleId="approval-heading"
      descriptionId="approval-safety"
      title="Confirm this change"
      onDismiss={onExit}
      returnFocusRef={returnFocusRef}
      actions={<>
        <Button disabled={busy} onClick={onConfirm}>{busy ? "Working..." : "Confirm"}</Button>
        <Button variant="outline" disabled={busy} onClick={onChooseDifferent}>Choose a different option</Button>
        <Button variant="outline" disabled={busy} onClick={onReject}>Reject</Button>
        <Button variant="ghost" disabled={busy} onClick={onExit}>Exit</Button>
      </>}
    >
      <p className="font-medium text-neutral-950">No change will be made unless you confirm.</p>
      <dl className="mt-4 grid gap-x-3 gap-y-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
        <dt className="text-neutral-600">Failed step</dt><dd>{summary.failedStep}</dd>
        <dt className="text-neutral-600">Original error</dt><dd>{summary.originalError}</dd>
        <dt className="text-neutral-600">Likely cause</dt><dd>{summary.likelyCause}</dd>
      </dl>
      <div className="mt-4"><EvidenceList items={summary.evidence} /></div>
      <div className="mt-4"><DiffView field={summary.fieldPath} current={describeResultValue(summary.currentValue)} proposed={describeResultValue(summary.proposedValue)} /></div>
      <div className="mt-4 space-y-2 text-sm">
        <p><strong>Expected effect:</strong> {summary.expectedEffect}</p>
        {summary.uncertaintyNote ? <p><strong>Uncertainty:</strong> {summary.uncertaintyNote}</p> : null}
      </div>
      {error ? <Notice className="mt-4" tone="error">{error}</Notice> : null}
    </DialogPanel>
  );
}
