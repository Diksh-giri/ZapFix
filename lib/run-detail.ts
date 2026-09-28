import type { RunView } from "@/lib/schemas/runs";

export type RunDetailState =
  | { status: "idle"; runId: null; view: null; error: null }
  | { status: "loading"; runId: string; view: RunView | null; error: null }
  | { status: "ready"; runId: string; view: RunView; error: null }
  | { status: "error"; runId: string; view: RunView | null; error: string };

export type RunDetailAction =
  | { type: "selected"; runId: string }
  | { type: "load_started" }
  | { type: "load_succeeded"; view: RunView }
  | { type: "load_failed"; message: string };

export const initialRunDetailState: RunDetailState = {
  status: "idle",
  runId: null,
  view: null,
  error: null,
};

export function runDetailReducer(state: RunDetailState, action: RunDetailAction): RunDetailState {
  switch (action.type) {
    case "selected":
      return { status: "loading", runId: action.runId, view: null, error: null };
    case "load_started":
      if (!state.runId) return state;
      return { status: "loading", runId: state.runId, view: state.view, error: null };
    case "load_succeeded":
      return { status: "ready", runId: action.view.run.id, view: action.view, error: null };
    case "load_failed":
      if (!state.runId) return state;
      return { status: "error", runId: state.runId, view: state.view, error: action.message };
  }
}

export function shouldPollRun(state: RunDetailState): boolean {
  return state.view?.run.status === "running";
}

export function createExclusiveActionRunner() {
  let active = false;
  return async function run(action: () => Promise<void>): Promise<boolean> {
    if (active) return false;
    active = true;
    try {
      await action();
      return true;
    } finally {
      active = false;
    }
  };
}

export function runActionErrorMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    repair_limit_reached: "ZapFix has reached the repair limit for this run. Review the error and edit the workflow manually.",
    rate_limited: "You have made too many requests. Wait a little while, then try again.",
    no_active_connection: "Reconnect the app before retrying this workflow.",
    uncertain_needs_confirmation: "Check the connected app, then confirm that you want to retry this uncertain action.",
    already_succeeded: "This action already succeeded and cannot be retried.",
    attempt_running: "This action is already running. Wait for it to finish.",
  };
  return messages[code] ?? fallback;
}
