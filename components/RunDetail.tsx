"use client";

import { useCallback, useEffect, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { initialRunDetailState, runDetailReducer, shouldPollRun } from "@/lib/run-detail";
import { loadRun } from "@/lib/runs-client";

const POLL_INTERVAL_MS = 1_500;

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
      <p className="text-sm">Status: <strong>{view.run.status}</strong></p>
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
