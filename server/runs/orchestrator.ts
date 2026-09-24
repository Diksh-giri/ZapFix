import { AppError } from "@/lib/errors";
import type { AppId, AttemptStatus } from "@/lib/types";
import type { TriggerData } from "@/lib/schemas/workflow-config";
import type { AppAdapter } from "@/server/adapters/types";
import type { RateBucket } from "@/server/audit/events";
import type { AccessTokenResult } from "@/server/connections/access-token";
import { maskQuotedValues } from "@/server/diagnosis/ai/payload";
import { resolveConfig } from "@/server/workflows/resolve";
import { assertRetryAllowed, effectiveStatus, idempotencyKey } from "./engine";
import type { AttemptRecord, RunRecord, RunStore, WorkflowRecord } from "./store";

const STEP = "action";

export interface RunEngineDeps {
  store: RunStore;
  getAdapter: (app: AppId) => AppAdapter;
  /** T9's getAccessToken, bound to its dependencies. Returns a typed result; never log the token. */
  getAccessToken: (connectionId: string, userId: string) => Promise<AccessTokenResult>;
  /** T15's checkRateLimit, bound to its store. Throws AppError("rate_limited") over the limit. */
  checkRateLimit: (userId: string, bucket: RateBucket) => Promise<void>;
  /** Optional, best effort: a failing event write never breaks a run. Payloads hold ids and enums only. */
  recordEvent?: (e: {
    userId: string;
    runId: string;
    type: "retry_started" | "retry_finished";
    payload: { attempt_no: number; outcome?: AttemptStatus };
  }) => Promise<void>;
  now: () => Date;
  appCallTimeoutMs: number;
  staleRunningMs: number;
}

export interface RunView {
  run: RunRecord;
  attempts: AttemptRecord[];
}

export function createRunEngine(deps: RunEngineDeps) {
  const { store } = deps;

  async function loadOwnedRun(runId: string, userId: string): Promise<RunRecord> {
    const run = await store.getRun(runId);
    if (!run || run.userId !== userId) throw new AppError("not_found", "Run not found.");
    return run;
  }

  /** Persist "uncertain" for stale running attempts and make the run status follow the latest attempt. */
  async function reconcile(runId: string): Promise<AttemptRecord[]> {
    const attempts = await store.listAttempts(runId);
    let changed = false;
    for (const a of attempts) {
      const eff = effectiveStatus(a, deps.now(), deps.staleRunningMs);
      if (eff !== a.status) {
        await store.updateAttempt(a.id, { status: eff, finishedAt: deps.now() });
        a.status = eff;
        changed = true;
      }
    }
    const latest = attempts[attempts.length - 1];
    if (changed && latest) await store.updateRun(runId, { status: latest.status, finishedAt: deps.now() });
    return attempts;
  }

  async function executeAttempt(
    run: RunRecord,
    wf: WorkflowRecord,
    attemptNo: number,
  ): Promise<RunRecord> {
    const attempt = await store.insertAttempt({
      runId: run.id,
      stepKey: STEP,
      attemptNo,
      status: "running",
      configSnapshot: wf.config,
      idempotencyKey: idempotencyKey(run.id, STEP, attemptNo),
      startedAt: deps.now(),
    });
    await store.updateRun(run.id, { status: "running", finishedAt: undefined });

    const finish = async (status: AttemptStatus, patch: Partial<AttemptRecord>) => {
      const finishedAt = deps.now();
      await store.updateAttempt(attempt.id, { ...patch, status, finishedAt });
      await store.updateRun(run.id, { status, finishedAt });
    };

    let tokenResult: AccessTokenResult;
    try {
      tokenResult = await deps.getAccessToken(wf.connectionId ?? "", wf.userId);
    } catch {
      tokenResult = { ok: false, reason: "needs_reconnect", code: "token_unavailable" };
    }
    if (!tokenResult.ok) {
      const errorStd =
        tokenResult.reason === "temporarily_unavailable"
          ? {
              category_hint: "unavailable",
              code: "token_refresh_unavailable",
              message: "We could not refresh the connection right now. Try again in a moment.",
              retryable: true,
              outcome: "not_executed",
            }
          : {
              category_hint: "auth",
              code: tokenResult.code,
              message: "The connection to this app has expired or was removed. Reconnect it and try again.",
              retryable: false,
              outcome: "not_executed",
            };
      await finish("failed", { errorStd, errorRaw: { code: errorStd.code, message: errorStd.message } });
      return (await store.getRun(run.id)) ?? run;
    }
    const token = tokenResult.accessToken;

    const result = await deps.getAdapter(wf.appId).execute(
      wf.actionKey,
      resolveConfig(wf.config, run.triggerData),
      { accessToken: token, idempotencyKey: attempt.idempotencyKey, timeoutMs: deps.appCallTimeoutMs },
    );

    if (result.ok) {
      await finish("succeeded", { externalRef: result.externalRef, requestSummary: result.requestSummary });
    } else {
      const message = maskQuotedValues(result.error.message);
      await finish(result.error.outcome === "uncertain" ? "uncertain" : "failed", {
        requestSummary: result.requestSummary,
        errorStd: { ...result.error, message },
        errorRaw: { code: result.error.code, message },
      });
    }
    return (await store.getRun(run.id)) ?? run;
  }

  async function loadRunnableWorkflow(workflowId: string, userId: string): Promise<WorkflowRecord> {
    const wf = await store.getWorkflow(workflowId);
    if (!wf || wf.userId !== userId) throw new AppError("not_found", "Workflow not found.");
    if (!wf.connectionId || wf.connectionStatus !== "active") {
      throw new AppError("no_active_connection", "Reconnect this app before running the workflow.");
    }
    return wf;
  }

  const emit = async (e: Parameters<NonNullable<RunEngineDeps["recordEvent"]>>[0]) => {
    try {
      await deps.recordEvent?.(e);
    } catch {
      // events are best effort
    }
  };

  return {
    async startRun(workflowId: string, userId: string, triggerData: TriggerData): Promise<RunRecord> {
      await deps.checkRateLimit(userId, "runs");
      const wf = await loadRunnableWorkflow(workflowId, userId);
      const missing = wf.triggerFields.filter((k) => typeof triggerData[k] !== "string");
      if (missing.length > 0) {
        throw new AppError("validation_failed", "Some trigger fields are missing.", { fields: missing });
      }
      const run = await store.insertRun({ workflowId, userId, triggerData, startedAt: deps.now() });
      return executeAttempt(run, wf, 1);
    },

    async getRun(runId: string, userId: string): Promise<RunView> {
      await loadOwnedRun(runId, userId);
      const attempts = await reconcile(runId);
      const run = await loadOwnedRun(runId, userId);
      // TODO(T13): include the latest diagnosis id.
      return { run, attempts };
    },

    async retryFailedStep(
      runId: string,
      userId: string,
      opts: { confirmUncertain?: boolean } = {},
    ): Promise<RunRecord> {
      const run = await loadOwnedRun(runId, userId);
      await deps.checkRateLimit(userId, "retries");
      const attempts = await reconcile(runId);
      const previous = attempts[attempts.length - 1];
      assertRetryAllowed(previous, deps.now(), deps.staleRunningMs, { confirmUncertain: opts.confirmUncertain });
      if (!previous) return run;

      const wf = await loadRunnableWorkflow(run.workflowId, userId);
      const changeAt = await store.lastChangeAppliedAt(runId);
      const changeApplied = changeAt !== undefined && changeAt > previous.startedAt;

      const attemptNo = previous.attemptNo + 1;
      await emit({ userId, runId, type: "retry_started", payload: { attempt_no: attemptNo } });
      const after = await executeAttempt(run, wf, attemptNo);
      await emit({ userId, runId, type: "retry_finished", payload: { attempt_no: attemptNo, outcome: after.status } });
      if (changeApplied && after.status !== "succeeded") {
        await store.updateRun(runId, { repairCount: run.repairCount + 1 });
        return (await store.getRun(runId)) ?? after;
      }
      return after;
    },
  };
}

export type RunEngine = ReturnType<typeof createRunEngine>;
