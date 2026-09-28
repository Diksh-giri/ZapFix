import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EvidenceList } from "@/components/EvidenceList";
import { canRetryDiagnosis, manualModeTip, type ManualModeReason } from "@/lib/manual-mode";
import type { DiagnosisView } from "@/lib/schemas/diagnosis";
import type { StandardError } from "@/lib/schemas/standard-error";

const REASON_TEXT: Record<ManualModeReason, string> = {
  unsupported: "ZapFix does not support this type of failure yet.",
  low_confidence: "ZapFix does not have enough confidence to offer a safe change.",
  no_candidates: "ZapFix did not find a safe configuration option for this failure.",
  ai_unavailable: "The diagnosis service is temporarily unavailable.",
  ai_invalid: "The diagnosis service did not return a safe, valid answer.",
  repair_limit_reached: "ZapFix has reached the repair limit for this run. Review the error and edit the workflow manually.",
};

interface ManualModeProps {
  reason: ManualModeReason;
  diagnosis: DiagnosisView | null;
  originalError: StandardError;
  workflowId: string;
  retrying?: boolean;
  onRetryDiagnosis?: () => void;
}

/** Fixed, rules-based help shown when ZapFix cannot safely offer a change. */
export function ManualMode({
  reason,
  diagnosis,
  originalError,
  workflowId,
  retrying = false,
  onRetryDiagnosis,
}: ManualModeProps) {
  const retryAllowed = canRetryDiagnosis(reason) && onRetryDiagnosis;

  return (
    <section className="space-y-5 border-t pt-5" aria-labelledby="manual-mode-heading">
      <div className="space-y-1">
        <h3 id="manual-mode-heading" className="font-semibold">Continue manually</h3>
        <p className="text-sm">{REASON_TEXT[reason]}</p>
        <p className="text-sm">No change has been made.</p>
      </div>

      <section className="space-y-1" aria-labelledby="manual-original-error-heading">
        <h4 id="manual-original-error-heading" className="text-sm font-medium">Original error from the app</h4>
        <p className="text-sm">{originalError.message}</p>
        <p className="text-sm text-neutral-600">
          Code: {originalError.code}{originalError.field ? ` · Field: ${originalError.field}` : ""}
        </p>
      </section>

      {diagnosis?.evidence.length ? <EvidenceList items={diagnosis.evidence} /> : null}

      <section className="space-y-1" aria-labelledby="manual-guidance-heading">
        <h4 id="manual-guidance-heading" className="text-sm font-medium">What you can check</h4>
        <p className="text-sm">{manualModeTip(diagnosis?.category)}</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {retryAllowed ? (
          <Button disabled={retrying} onClick={onRetryDiagnosis}>
            {retrying ? "Trying diagnosis again..." : "Try diagnosis again"}
          </Button>
        ) : null}
        <Link className="text-sm font-medium underline underline-offset-4" href={`/workflows/${workflowId}`}>
          Return to workflow editor
        </Link>
      </div>
    </section>
  );
}
