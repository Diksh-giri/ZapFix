"use client";

import { useRef } from "react";
import { ApprovalDialog } from "@/components/ApprovalDialog";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { DiffView } from "@/components/DiffView";
import { EvidenceList } from "@/components/EvidenceList";
import { Button } from "@/components/ui/button";
import { describeResultValue } from "@/lib/result-recovery";
import type { DiagnosisView } from "@/lib/schemas/diagnosis";
import type { ProposalOptionView, ProposalView } from "@/lib/schemas/proposals";

const CONFIDENCE_REASON = {
  high: "The system evidence strongly supports this cause and option.",
  medium: "The evidence supports this option, but some uncertainty remains.",
  low: "The evidence is not strong enough to offer an automatic change.",
} as const;

export function DebuggerPanel({ diagnosis, proposal, selectedOptionId, dialogOpen, busy, error, onSelectOption, onOpenDialog, onCloseDialog, onConfirm, onReject, onExit }: {
  diagnosis: DiagnosisView;
  proposal: ProposalView;
  selectedOptionId: string;
  dialogOpen: boolean;
  busy: boolean;
  error: string | null;
  onSelectOption: (id: string) => void;
  onOpenDialog: () => void;
  onCloseDialog: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onExit: () => void;
}) {
  const approvalTriggerRef = useRef<HTMLButtonElement>(null);
  if (proposal.kind === "reconnect_guidance") {
    return (
      <section className="space-y-4" aria-labelledby="diagnosis-heading">
        <h3 id="diagnosis-heading" className="font-semibold">Diagnosis</h3>
        <EvidenceList items={diagnosis.evidence} />
        <div aria-label="AI-generated explanation" className="space-y-1 border-l-2 border-neutral-300 pl-3 text-sm">
          <h4 className="font-medium">AI-generated explanation</h4><p>{diagnosis.ai?.explanation}</p>
        </div>
        <a href="/connections" className="inline-flex h-8 items-center rounded-lg bg-black px-3 text-sm font-medium text-white">Reconnect</a>
      </section>
    );
  }
  const selected = proposal.options.find((option) => option.id === selectedOptionId);
  if (!selected || !diagnosis.ai || !diagnosis.confidence || diagnosis.confidence === "low") return null;
  return (
    <section className="space-y-5" aria-labelledby="diagnosis-heading">
      <div className="space-y-3">
        <h3 id="diagnosis-heading" className="font-semibold">Diagnosis</h3>
        <EvidenceList items={diagnosis.evidence} />
        <div aria-label="AI-generated explanation" className="space-y-1 border-l-2 border-neutral-300 pl-3 text-sm">
          <h4 className="font-medium">AI-generated explanation</h4>
          <p><strong>Likely cause:</strong> {diagnosis.ai.likely_cause}</p><p>{diagnosis.ai.explanation}</p>
        </div>
        <ConfidenceBadge level={diagnosis.confidence} reason={CONFIDENCE_REASON[diagnosis.confidence]} />
      </div>
      <div className="space-y-3">
        <h4 className="font-medium">Proposed change</h4>
        <label className="block text-sm font-medium" htmlFor="proposal-option">Valid option</label>
        <select id="proposal-option" value={selectedOptionId} disabled={busy || dialogOpen} onChange={(event) => onSelectOption(event.target.value)} className="w-full rounded border px-3 py-2 text-sm">
          {proposal.options.map((option) => <option key={option.id} value={option.id}>{option.description}</option>)}
        </select>
        <DiffView field={selected.summary.fieldPath} current={describeResultValue(selected.summary.currentValue)} proposed={describeResultValue(selected.summary.proposedValue)} />
        <p className="text-sm"><strong>Expected effect:</strong> {selected.summary.expectedEffect}</p>
        {selected.summary.uncertaintyNote ? <p className="text-sm"><strong>Uncertainty:</strong> {selected.summary.uncertaintyNote}</p> : null}
        <p className="text-sm font-medium">No change will be made unless you confirm.</p>
        <Button ref={approvalTriggerRef} disabled={busy || proposal.status !== "pending"} onClick={onOpenDialog}>Review and confirm</Button>
      </div>
      <ApprovalDialog returnFocusRef={approvalTriggerRef} open={dialogOpen} summary={selected.summary} busy={busy} error={error} onConfirm={onConfirm} onChooseDifferent={onCloseDialog} onReject={onReject} onExit={onExit} />
    </section>
  );
}

export function defaultProposalOption(proposal: ProposalView): ProposalOptionView | undefined {
  return proposal.options.find((option) => option.isDefault) ?? proposal.options[0];
}
