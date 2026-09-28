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
