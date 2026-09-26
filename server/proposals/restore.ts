import { AppError } from "@/lib/errors";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { recordEvent } from "@/server/audit/events";
import { applyFieldChange, hasManualEditConflict, readFieldValue } from "@/server/changes/applier";
import type { ProposalStore } from "./store";

export interface RestoreResult {
  configChangeId: string;
  status: "restored";
  workflow: { id: string; configVersion: number; config: ActionConfig };
  /** Shown to the user: restore does not reach into the connected apps. */
  note: string;
}

const NOTE =
  "Restore reverts ZapFix settings only. It cannot undo actions already taken in Google Calendar, Gmail, Drive, Slack or Sheets.";

/**
 * Undo one applied change (Decision #011): put the exact `before` value back, in one all-or-nothing
 * transaction. Rules:
 *   - only the most recent change that is still applied (undo goes most-recent-first)
 *   - if the SAME setting was edited by hand since, refuse with manual_edit_conflict unless the user
 *     confirmed the overwrite; edits to other settings are kept
 *   - the approval and the change record are never deleted or rewritten; only status/restored_at change
 * `restore_started` is kept even when the restore is refused, so started vs finished shows refusals.
 */
export async function restoreChange(
  deps: { store: ProposalStore; now: () => Date },
  input: { changeId: string; userId: string; confirmOverwrite?: boolean },
): Promise<RestoreResult> {
  type Outcome = { ok: true; result: RestoreResult } | { ok: false; error: AppError };

  const outcome: Outcome = await deps.store.transaction(async (tx): Promise<Outcome> => {
    const ctx = await tx.loadChange(input.changeId);
    if (!ctx || ctx.workflow.userId !== input.userId) throw new AppError("not_found", "That change was not found.");
    const { change, workflow, runId } = ctx;

    await recordEvent(tx.audit, {
      userId: input.userId,
      runId,
      type: "restore_started",
      payload: { config_change_id: change.id },
    });

    if (change.status === "restored") {
      return { ok: false, error: new AppError("conflict", "This change has already been restored.") };
    }
    if (ctx.latestAppliedId !== change.id) {
      return {
        ok: false,
        error: new AppError("conflict", "Only the most recent applied change can be restored. Restore the newer changes first."),
      };
    }

    const current = readFieldValue(workflow.config, change.fieldPath) ?? null;
    const overwrote = hasManualEditConflict(current, change.afterValue);
    if (overwrote && !input.confirmOverwrite) {
      return {
        ok: false,
        error: new AppError(
          "manual_edit_conflict",
          "This setting was edited by hand after the change was applied. Restoring will overwrite that edit. Confirm to continue.",
        ),
      };
    }

    const newConfig = applyFieldChange(workflow.config, change.fieldPath, change.beforeValue);
    if (!(await tx.updateWorkflowConfig(workflow.id, newConfig, workflow.configVersion))) {
      throw new AppError("conflict", "The settings changed while restoring. Nothing was restored; please try again.");
    }
    await tx.markChangeRestored(change.id, deps.now());
    await recordEvent(tx.audit, {
      userId: input.userId,
      runId,
      type: "restore_finished",
      payload: { config_change_id: change.id, overwrote },
    });

    return {
      ok: true,
      result: {
        configChangeId: change.id,
        status: "restored",
        workflow: { id: workflow.id, configVersion: workflow.configVersion + 1, config: newConfig },
        note: NOTE,
      },
    };
  });

  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}
