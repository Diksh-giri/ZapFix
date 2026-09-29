"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ManualMode } from "@/components/ManualMode";
import { AppliedChangeResult } from "@/components/AppliedChangeResult";
import { DebuggerPanel, defaultProposalOption } from "@/components/DebuggerPanel";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { StatePanel } from "@/components/ui/state-panel";
import { StepStatusList } from "@/components/StepStatusList";
import { manualModeReason } from "@/lib/manual-mode";
import {
  createExclusiveActionRunner,
  initialRunDetailState,
  runActionErrorMessage,
  runDetailReducer,
  shouldRecordFailureOpened,
  shouldPollRun,
} from "@/lib/run-detail";
import { confirmProposal, decideProposal, loadDiagnosis, loadRun, recordFailureOpened, recordSummaryViewed, requestDiagnosis, restoreAppliedChange, retryRun, RunRequestError } from "@/lib/runs-client";
import type { DiagnosisView } from "@/lib/schemas/diagnosis";
import type { AppliedChangeView } from "@/lib/schemas/change-results";
import type { ProposalView } from "@/lib/schemas/proposals";
import type { RunView } from "@/lib/schemas/runs";
import { classifyRetryOutcome, type RetryOutcome } from "@/lib/result-recovery";

const POLL_INTERVAL_MS = 1_500;

const STATUS_TEXT: Record<RunView["run"]["status"], string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  uncertain: "Outcome uncertain",
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function explainActionError(caught: unknown, fallback: string): string {
  const code = caught instanceof RunRequestError ? caught.code : "request_failed";
  const message = caught instanceof Error ? caught.message : fallback;
  return runActionErrorMessage(code, message);
}

export function RunEvidence({ view }: { view: RunView }) {
  const attempts = [...view.attempts].sort((a, b) => a.attemptNo - b.attemptNo);
  const latestAttempt = attempts.at(-1);
  const originalError = attempts.find((attempt) => attempt.errorStd)?.errorStd;
  const triggerEntries = Object.entries(view.run.triggerData).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm">Overall status: <strong>{STATUS_TEXT[view.run.status]}</strong></p>
        <p className="mt-1 text-sm text-neutral-600">
          Started <time dateTime={view.run.startedAt}>{formatTime(view.run.startedAt)}</time>
        </p>
        {view.run.status === "uncertain" ? (
          <p className="mt-2 text-sm font-medium">
            The external action may already have occurred. Check the connected app before retrying.
          </p>
        ) : null}
      </div>

      <section aria-labelledby="workflow-steps-heading" className="space-y-3">
        <h3 id="workflow-steps-heading" className="font-semibold">Workflow steps</h3>
        <StepStatusList steps={[
          {
            key: "trigger",
            label: "Form trigger",
            status: "succeeded",
            detail: "Form submission received.",
          },
          {
            key: "action",
            label: "External action",
            status: latestAttempt?.status ?? view.run.status,
            detail: latestAttempt ? `Latest attempt: ${latestAttempt.attemptNo}` : "Waiting for the first attempt.",
          },
        ]} />
      </section>

      <section aria-labelledby="run-data-heading" className="space-y-3">
        <h3 id="run-data-heading" className="font-semibold">Data used for this run</h3>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]">
          {triggerEntries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-medium">{key}</dt>
              <dd className="break-words">{value === "" ? "Empty" : value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {originalError ? (
        <section aria-labelledby="original-error-heading" className="space-y-2">
          <h3 id="original-error-heading" className="font-semibold">Original error from the app</h3>
          <p className="text-sm">{originalError.message}</p>
          <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-neutral-600">Code</dt><dd>{originalError.code}</dd>
            {originalError.field ? <><dt className="text-neutral-600">Field</dt><dd>{originalError.field}</dd></> : null}
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="attempt-history-heading" className="space-y-3">
        <h3 id="attempt-history-heading" className="font-semibold">Attempt history</h3>
        <ol className="space-y-2 text-sm">
          {attempts.map((attempt) => (
            <li key={attempt.id} className="border-l-2 border-neutral-300 pl-3">
              <p><strong>Attempt {attempt.attemptNo}: {STATUS_TEXT[attempt.status]}</strong></p>
              <p className="text-neutral-600">
                Started <time dateTime={attempt.startedAt}>{formatTime(attempt.startedAt)}</time>
                {attempt.finishedAt ? <> · Finished <time dateTime={attempt.finishedAt}>{formatTime(attempt.finishedAt)}</time></> : null}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

interface RunActionsProps {
  view: RunView;
  busy: "diagnose" | "retry" | "restore" | "proposal" | null;
  diagnosisId: string | null;
  confirmUncertain: boolean;
  error: string | null;
  onConfirmUncertain: (confirmed: boolean) => void;
  onDiagnose: () => void;
  onRetry: () => void;
}

export function RunActions({
  view,
  busy,
  diagnosisId,
  confirmUncertain,
  error,
  onConfirmUncertain,
  onDiagnose,
  onRetry,
}: RunActionsProps) {
  const latestStatus = view.attempts.at(-1)?.status ?? view.run.status;
  const canAct = latestStatus === "failed" || latestStatus === "uncertain";
  if (!canAct) return null;

  return (
    <section className="space-y-3" aria-labelledby="run-actions-heading">
      <h3 id="run-actions-heading" className="font-semibold">Next actions</h3>
      {latestStatus === "uncertain" ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmUncertain}
            disabled={busy !== null}
            onChange={(event) => onConfirmUncertain(event.target.checked)}
          />
          <span>I checked the connected app and want to retry even though the action may already have occurred.</span>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {diagnosisId ? (
          <p className="text-sm font-medium" role="status">Diagnosis ready.</p>
        ) : (
          <Button disabled={busy !== null} onClick={onDiagnose}>
            {busy === "diagnose" ? "Diagnosing..." : "Diagnose"}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy !== null || (latestStatus === "uncertain" && !confirmUncertain)}
          onClick={onRetry}
        >
          {busy === "retry" ? "Retrying..." : "Retry"}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </section>
  );
}

interface RunDiagnosisPanelProps {
  view: RunView;
  diagnosis: DiagnosisView | null;
  repairLimitReached: boolean;
  retrying: boolean;
  onRetryDiagnosis: () => void;
  onReturnToEditor: () => void;
}

export function RunDiagnosisPanel({
  view,
  diagnosis,
  repairLimitReached,
  retrying,
  onRetryDiagnosis,
  onReturnToEditor,
}: RunDiagnosisPanelProps) {
  const reason = manualModeReason(diagnosis, repairLimitReached);
  const originalError = view.attempts.find((attempt) => attempt.errorStd)?.errorStd;
  if (!reason || !originalError) return null;

  return (
    <ManualMode
      reason={reason}
      diagnosis={diagnosis}
      originalError={originalError}
      retrying={retrying}
      onRetryDiagnosis={onRetryDiagnosis}
      onReturnToEditor={onReturnToEditor}
    />
  );
}

export function RunDetail({
  runId,
  onReturnToEditor,
  appliedChange: initialAppliedChange = null,
}: {
  runId: string;
  onReturnToEditor: () => void;
  appliedChange?: AppliedChangeView | null;
}) {
  const [state, dispatch] = useReducer(runDetailReducer, initialRunDetailState);
  const [busy, setBusy] = useState<"diagnose" | "retry" | "restore" | "proposal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [diagnosisState, setDiagnosisState] = useState<{ runId: string; value: DiagnosisView } | null>(null);
  const [proposalState, setProposalState] = useState<{ runId: string; value: ProposalView } | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [proposalOutdatedRunId, setProposalOutdatedRunId] = useState<string | null>(null);
  const [appliedChangeState, setAppliedChangeState] = useState<{ runId: string; value: AppliedChangeView } | null>(null);
  const [repairLimitState, setRepairLimitState] = useState<{ runId: string; reached: true } | null>(null);
  const [confirmUncertain, setConfirmUncertain] = useState(false);
  const [retryOutcomeState, setRetryOutcomeState] = useState<{
    runId: string;
    configChangeId: string;
    value: RetryOutcome;
  } | null>(null);
  const [restoreView, setRestoreView] = useState<{
    changeId: string;
    state: "idle" | "confirming" | "conflict" | "restoring" | "restored";
    error: string | null;
  } | null>(null);
  const openedRuns = useRef(new Set<string>());
  const actionRunner = useRef(createExclusiveActionRunner());
  const diagnosis = diagnosisState?.runId === runId ? diagnosisState.value : null;
  const proposal = proposalState?.runId === runId ? proposalState.value : null;
  const appliedChange = appliedChangeState?.runId === runId ? appliedChangeState.value : initialAppliedChange;
  const repairLimitReached = repairLimitState?.runId === runId;
  const retryOutcome = retryOutcomeState?.runId === runId && retryOutcomeState.configChangeId === appliedChange?.configChangeId
    ? retryOutcomeState.value
    : null;
  const restoreState = appliedChange && restoreView?.changeId === appliedChange.configChangeId ? restoreView.state : "idle";
  const restoreError = appliedChange && restoreView?.changeId === appliedChange.configChangeId ? restoreView.error : null;

  const refresh = useCallback(async () => {
    dispatch({ type: "load_started" });
    try {
      dispatch({ type: "load_succeeded", view: await loadRun(runId) });
    } catch (caught) {
      dispatch({
        type: "load_failed",
        message: caught instanceof Error ? caught.message : "The run could not be loaded.",
      });
    }
  }, [runId]);

  useEffect(() => {
    dispatch({ type: "selected", runId });
    void refresh();
  }, [refresh, runId]);

  useEffect(() => {
    if (!shouldPollRun(state)) return;
    const timer = window.setTimeout(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [refresh, state]);

  useEffect(() => {
    const view = state.view;
    if (!view) return;
    if (shouldRecordFailureOpened(openedRuns.current, view.run)) {
      void recordFailureOpened(view.run.id).catch(() => {});
    }
  }, [state.view]);

  useEffect(() => {
    const diagnosisId = state.view?.latestDiagnosisId;
    if (!diagnosisId || diagnosis?.id === diagnosisId) return;
    let cancelled = false;
    void loadDiagnosis(diagnosisId)
      .then((loaded) => {
        if (!cancelled) {
          setDiagnosisState({ runId, value: loaded.diagnosis });
          setProposalState(loaded.proposal ? { runId, value: loaded.proposal } : null);
          setSelectedOptionId(loaded.proposal ? defaultProposalOption(loaded.proposal)?.id ?? "" : "");
          setActionError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) setActionError(explainActionError(caught, "The diagnosis could not be loaded."));
      });
    return () => { cancelled = true; };
  }, [diagnosis?.id, runId, state.view?.latestDiagnosisId]);

  const diagnose = () => actionRunner.current(async () => {
    setBusy("diagnose"); setActionError(null);
    try {
      const result = await requestDiagnosis(runId);
      setDiagnosisState({ runId, value: result.diagnosis });
      setProposalState(result.proposal ? { runId, value: result.proposal } : null);
      setSelectedOptionId(result.proposal ? defaultProposalOption(result.proposal)?.id ?? "" : "");
      setApprovalOpen(false);
      setProposalOutdatedRunId(null);
      setRepairLimitState(null);
    } catch (caught) {
      if (caught instanceof RunRequestError && caught.code === "repair_limit_reached") {
        setRepairLimitState({ runId, reached: true });
        setActionError(null);
      } else {
        setActionError(explainActionError(caught, "The diagnosis could not be started."));
      }
    } finally {
      setBusy(null);
    }
  });

  const openApproval = () => {
    if (!proposal || !selectedOptionId || busy !== null) return;
    setActionError(null);
    setApprovalOpen(true);
    void recordSummaryViewed(runId).catch(() => {});
  };

  const decide = (decision: "rejected" | "exited") => actionRunner.current(async () => {
    if (!proposal) return;
    setBusy("proposal"); setActionError(null);
    try {
      await decideProposal(proposal.id, decision);
      setProposalState({ runId, value: { ...proposal, status: "decided" } });
      setApprovalOpen(false);
    } catch (caught) {
      setActionError(explainActionError(caught, "The proposal decision could not be saved."));
    } finally {
      setBusy(null);
    }
  });

  const confirm = () => actionRunner.current(async () => {
    if (!proposal) return;
    const option = proposal.options.find((candidate) => candidate.id === selectedOptionId);
    if (!option) return;
    setBusy("proposal"); setActionError(null);
    try {
      const result = await confirmProposal(proposal.id, {
        ...(option.isDefault ? {} : { selectedOptionId: option.id }),
        expectedConfigVersion: proposal.baseConfigVersion,
        summaryHash: option.summaryHash,
      });
      setAppliedChangeState({ runId, value: {
        configChangeId: result.configChangeId,
        approvalId: result.approvalId,
        fieldPath: option.summary.fieldPath,
        originalValue: option.summary.currentValue,
        updatedValue: option.summary.proposedValue,
      } });
      setProposalState({ runId, value: { ...proposal, status: "decided" } });
      setApprovalOpen(false);
    } catch (caught) {
      setActionError(explainActionError(caught, "The proposed change could not be applied."));
      if (caught instanceof RunRequestError && caught.code === "proposal_outdated") {
        setApprovalOpen(false);
        setProposalState(null);
        setProposalOutdatedRunId(runId);
      }
    } finally {
      setBusy(null);
    }
  });

  const retry = () => actionRunner.current(async () => {
    const latestStatus = state.view?.attempts.at(-1)?.status ?? state.view?.run.status;
    if (latestStatus === "uncertain" && !confirmUncertain) {
      setActionError("Check the connected app and confirm before retrying this uncertain action.");
      return;
    }
    setBusy("retry"); setActionError(null);
    try {
      const originalView = state.view;
      const view = await retryRun(runId, latestStatus === "uncertain" && confirmUncertain);
      dispatch({ type: "load_succeeded", view });
      setConfirmUncertain(false);
      if (appliedChange && originalView) {
        const outcome = classifyRetryOutcome(originalView, view);
        setRetryOutcomeState({ runId, configChangeId: appliedChange.configChangeId, value: outcome });
        if (outcome === "new_error") {
          setDiagnosisState(null);
          setRepairLimitState(null);
        }
      }
    } catch (caught) {
      setActionError(explainActionError(caught, "The action could not be retried."));
    } finally {
      setBusy(null);
    }
  });

  const restore = (confirmOverwrite: boolean) => actionRunner.current(async () => {
    if (!appliedChange) return;
    const changeId = appliedChange.configChangeId;
    setBusy("restore"); setRestoreView({ changeId, state: "restoring", error: null });
    try {
      await restoreAppliedChange(changeId, confirmOverwrite);
      setRestoreView({ changeId, state: "restored", error: null });
    } catch (caught) {
      if (caught instanceof RunRequestError && caught.code === "manual_edit_conflict") {
        setRestoreView({ changeId, state: "conflict", error: null });
        return;
      }
      setRestoreView({
        changeId,
        state: "idle",
        error: caught instanceof Error ? caught.message : "The previous setting could not be restored.",
      });
    } finally {
      setBusy(null);
    }
  });

  if (state.status === "idle" || (state.status === "loading" && !state.view)) {
    return <StatePanel state="loading" title="Loading run" description="Checking the latest attempt and its evidence." />;
  }

  if (state.status === "error" && !state.view) {
    return (
      <StatePanel state="error" title="This run could not be loaded" description={state.error ?? undefined} action={<Button variant="outline" onClick={() => void refresh()}>Try again</Button>} />
    );
  }

  const view = state.view;
  if (!view) return null;

  return (
    <section className="space-y-2 border-t pt-6" aria-labelledby="run-detail-heading">
      <h2 id="run-detail-heading" className="text-lg font-semibold">Latest test run</h2>
      {appliedChange ? (
        <AppliedChangeResult
          change={appliedChange}
          outcome={retryOutcome}
          restoreState={restoreState}
          restoreError={restoreError}
          onRequestRestore={() => {
            if (busy === null) setRestoreView({ changeId: appliedChange.configChangeId, state: "confirming", error: null });
          }}
          onCancelRestore={() => {
            if (busy === null) setRestoreView({ changeId: appliedChange.configChangeId, state: "idle", error: null });
          }}
          onConfirmRestore={(overwrite) => { if (busy === null) void restore(overwrite); }}
        />
      ) : null}
      <RunEvidence view={view} />
      <RunActions
        view={view}
        busy={busy}
        diagnosisId={retryOutcome === "new_error" || proposalOutdatedRunId === runId
          ? null
          : diagnosis?.id ?? view.latestDiagnosisId ?? (repairLimitReached ? "repair-limit" : null)}
        confirmUncertain={confirmUncertain}
        error={actionError}
        onConfirmUncertain={setConfirmUncertain}
        onDiagnose={() => void diagnose()}
        onRetry={() => void retry()}
      />
      <RunDiagnosisPanel
        view={view}
        diagnosis={retryOutcome === "new_error" ? null : diagnosis}
        repairLimitReached={repairLimitReached}
        retrying={busy === "diagnose"}
        onRetryDiagnosis={() => void diagnose()}
        onReturnToEditor={onReturnToEditor}
      />
      {diagnosis && proposal && !manualModeReason(diagnosis, repairLimitReached) ? (
        <DebuggerPanel
          diagnosis={diagnosis}
          proposal={proposal}
          selectedOptionId={selectedOptionId}
          dialogOpen={approvalOpen}
          busy={busy !== null}
          error={actionError}
          onSelectOption={setSelectedOptionId}
          onOpenDialog={openApproval}
          onCloseDialog={() => { if (busy === null) setApprovalOpen(false); }}
          onConfirm={() => void confirm()}
          onReject={() => void decide("rejected")}
          onExit={() => void decide("exited")}
        />
      ) : null}
      {state.status === "loading" ? <StatePanel state="loading" title="Checking run status" compact /> : null}
      {state.status === "error" ? (
        <StatePanel state="error" title="Run status could not be refreshed" description={state.error ?? undefined} compact action={<Button variant="outline" size="sm" onClick={() => void refresh()}>Try again</Button>} />
      ) : null}
    </section>
  );
}
