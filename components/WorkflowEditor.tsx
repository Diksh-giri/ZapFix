"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { FieldMapper } from "@/components/FieldMapper";
import { RunDetail } from "@/components/RunDetail";
import { TriggerForm } from "@/components/TriggerForm";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import type { AppCatalogItem, Workflow } from "@/lib/schemas/workflows";
import { loadWorkflow, loadWorkflowSetup, runWorkflow, updateWorkflow, WorkflowRequestError } from "@/lib/workflows-client";

export function returnToWorkflowEditor(
  setRunId: Dispatch<SetStateAction<string | null>>,
  heading: Pick<HTMLElement, "focus" | "scrollIntoView"> | null,
): void {
  setRunId(null);
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [apps, setApps] = useState<AppCatalogItem[]>([]);
  const [name, setName] = useState("");
  const [config, setConfig] = useState<ActionConfig>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);

  const refreshWorkflow = useCallback(async () => {
    try {
      const [item, setup] = await Promise.all([loadWorkflow(workflowId), loadWorkflowSetup()]);
      setWorkflow(item); setApps(setup.apps); setName(item.name); setConfig(item.actionConfig);
      setStatus("ready"); setError(null);
    } catch { setStatus("error"); }
  }, [workflowId]);
  useEffect(() => {
    // The editor owns this client-side request; state updates happen only after the promises settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshWorkflow();
  }, [refreshWorkflow]);

  const app = workflow ? apps.find((item) => item.id === workflow.app) : undefined;
  const action = app?.actions.find((item) => item.key === workflow?.actionKey);
  const hasUnsavedChanges = name !== workflow?.name || JSON.stringify(config) !== JSON.stringify(workflow?.actionConfig);
  const showEditor = useCallback(() => {
    returnToWorkflowEditor(setRunId, editorHeadingRef.current);
  }, []);

  async function save() {
    if (!workflow) return;
    setSaving(true); setMessage(null); setError(null);
    try {
      const updated = await updateWorkflow(workflow.id, {
        name, actionConfig: config, expectedConfigVersion: workflow.configVersion,
      });
      setWorkflow(updated); setMessage("Workflow saved.");
    } catch (caught) {
      if (caught instanceof WorkflowRequestError && caught.code === "version_conflict") {
        setError("This workflow changed after you opened it. Refresh before saving again.");
      } else setError(caught instanceof Error ? caught.message : "The workflow could not be saved.");
    } finally { setSaving(false); }
  }

  if (status === "loading") return <p role="status">Loading workflow...</p>;
  if (status === "error" || !workflow) return (
    <div role="alert" className="space-y-3"><p>This workflow could not be loaded.</p><Button variant="outline" onClick={() => { setStatus("loading"); void refreshWorkflow(); }}>Try again</Button></div>
  );

  return (
    <div className="space-y-6">
      <Link className="text-sm underline" href="/workflows">Back to workflows</Link>
      <header>
        <h1 ref={editorHeadingRef} tabIndex={-1} className="text-2xl font-semibold">Edit workflow</h1>
        <p className="mt-2 text-sm text-neutral-600">Version {workflow.configVersion} · Last changed by {workflow.lastModifiedBy}</p>
      </header>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Actions run on your real connected account. Use test data.</p>
      <label className="block text-sm font-medium">Name
        <input className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-3 text-sm" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {action ? <FieldMapper fields={action.fields} triggerSchema={workflow.triggerSchema} value={config} onChange={setConfig} /> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-green-700">{message}</p> : null}
      <div className="flex gap-3">
        <Button disabled={saving || name.trim() === ""} onClick={() => void save()}>{saving ? "Saving..." : "Save changes"}</Button>
        {error?.includes("Refresh") ? <Button variant="outline" onClick={() => { setStatus("loading"); void refreshWorkflow(); }}>Refresh</Button> : null}
      </div>
      <section className="border-t pt-6">
        {hasUnsavedChanges ? (
          <p className="mb-4 text-sm text-amber-800" role="status">
            Save your changes before running a test so the displayed settings match the settings ZapFix executes.
          </p>
        ) : null}
        <TriggerForm
          triggerSchema={workflow.triggerSchema}
          busy={running}
          disabled={hasUnsavedChanges}
          onRun={async (data) => {
            setRunning(true); setError(null); setMessage(null);
            try {
              const result = await runWorkflow(workflow.id, data);
              const startedRunId = result && typeof result === "object" && "run" in result
                && result.run && typeof result.run === "object" && "id" in result.run
                ? String(result.run.id)
                : null;
              setRunId(startedRunId);
              setMessage(startedRunId ? "Test started. Run details appear below." : "Test started.");
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "The test could not be started.");
            } finally { setRunning(false); }
          }}
        />
      </section>
      {runId ? <RunDetail runId={runId} onReturnToEditor={showEditor} /> : null}
    </div>
  );
}
