"use client";

import { useCallback, useEffect, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { StepStatusList } from "@/components/StepStatusList";
import { initialRunDetailState, runDetailReducer, shouldPollRun } from "@/lib/run-detail";
import { loadRun } from "@/lib/runs-client";
import type { RunView } from "@/lib/schemas/runs";

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
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
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

export function RunDetail({ runId }: { runId: string }) {
  const [state, dispatch] = useReducer(runDetailReducer, initialRunDetailState);

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

  if (state.status === "idle" || (state.status === "loading" && !state.view)) {
    return <p role="status">Loading run...</p>;
  }

  if (state.status === "error" && !state.view) {
    return (
      <div className="space-y-3" role="alert">
        <p>{state.error}</p>
        <Button variant="outline" onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  }

  const view = state.view;
  if (!view) return null;

  return (
    <section className="space-y-2 border-t pt-6" aria-labelledby="run-detail-heading">
      <h2 id="run-detail-heading" className="text-lg font-semibold">Latest test run</h2>
      <RunEvidence view={view} />
      {state.status === "loading" ? <p className="text-sm" role="status">Checking run status...</p> : null}
      {state.status === "error" ? (
        <div className="flex items-center gap-3" role="alert">
          <p className="text-sm">{state.error}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>Try again</Button>
        </div>
      ) : null}
    </section>
  );
}
