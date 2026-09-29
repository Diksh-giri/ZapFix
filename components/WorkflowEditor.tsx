"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { StatePanel } from "@/components/ui/state-panel";
import { RecoveryJourney } from "@/components/RecoveryJourney";
import { FieldMapper } from "@/components/FieldMapper";
import { RunDetail } from "@/components/RunDetail";
import { TriggerForm } from "@/components/TriggerForm";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import type { AppCatalogItem, Workflow } from "@/lib/schemas/workflows";
import type { ClientConnection } from "@/lib/schemas/connections";
import { activeConnectionsFor, loadWorkflow, loadWorkflowSetup, runWorkflow, updateWorkflow, WorkflowRequestError } from "@/lib/workflows-client";

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
  const [connections, setConnections] = useState<ClientConnection[]>([]);
  const [name, setName] = useState("");
  const [config, setConfig] = useState<ActionConfig>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [pickedConnectionId, setPickedConnectionId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const editorHeadingRef = useRef<HTMLDivElement>(null);

  const refreshWorkflow = useCallback(async () => {
    try {
      const [item, setup] = await Promise.all([loadWorkflow(workflowId), loadWorkflowSetup()]);
      setWorkflow(item); setApps(setup.apps); setConnections(setup.connections); setName(item.name); setConfig(item.actionConfig);
      setStatus("ready"); setError(null);
    } catch {
      setStatus("error");
    }
  }, [workflowId]);
  useEffect(() => {
    // The editor owns this client-side request; state updates happen only after the promises settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshWorkflow();
  }, [refreshWorkflow]);

  const app = workflow ? apps.find((item) => item.id === workflow.app) : undefined;
  const action = app?.actions.find((item) => item.key === workflow?.actionKey);
  const hasUnsavedChanges = name !== workflow?.name || JSON.stringify(config) !== JSON.stringify(workflow?.actionConfig);
  const connectedTo = workflow ? connections.find((item) => item.id === workflow.connectionId) : undefined;
  const compatibleConnections = app ? activeConnectionsFor(connections, app.provider) : [];
  const showEditor = useCallback(() => {
    returnToWorkflowEditor(setRunId, editorHeadingRef.current);
  }, []);

  async function connectConnection() {
    if (!workflow || !pickedConnectionId) return;
    setConnecting(true); setMessage(null); setError(null);
    try {
      const updated = await updateWorkflow(workflow.id, {
        connectionId: pickedConnectionId, expectedConfigVersion: workflow.configVersion,
      });
      setWorkflow(updated); setPickedConnectionId(""); setMessage("Connection saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The connection could not be saved.");
    } finally { setConnecting(false); }
  }

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

  if (status === "loading") return <StatePanel state="loading" title="Loading workflow" description="Getting the latest saved version." />;
  if (status === "error" || !workflow) {
    return (
      <StatePanel state="error" title="This workflow could not be loaded" description="Your saved workflow was not changed." action={<Button variant="outline" onClick={() => { setStatus("loading"); void refreshWorkflow(); }}>Try again</Button>} />
    );
  }

  return (
    <div className="space-y-6">
      <Link className="text-sm underline" href="/workflows">Back to workflows</Link>
      <div ref={editorHeadingRef} tabIndex={-1}>
        <PageHeader eyebrow="Workflow builder" title="Edit workflow" description={`Version ${workflow.configVersion} · Last changed by ${workflow.lastModifiedBy}`} />
      </div>
      <RecoveryJourney current={runId ? "Run" : "Build"} />
      <Notice tone="warning" title="Use test data">Actions run on your real connected account.</Notice>
      <Surface aria-labelledby="workflow-settings-heading">
      <h2 id="workflow-settings-heading" className="mb-4 font-semibold">Workflow settings</h2>
      <label className="block text-sm font-medium">Name
        <input className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-3 text-sm" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {workflow.connectionId ? (
        <p className="mt-4 text-sm text-neutral-600">Connection: {connectedTo?.accountLabel ?? app?.provider ?? "connected"}</p>
      ) : (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium">This workflow needs a connection</p>
          <p className="mt-1 text-sm text-neutral-600">Its connection was removed. Choose one to run this workflow again.</p>
          {compatibleConnections.length === 0 ? (
            <p className="mt-3 text-sm text-red-700">No active {app?.provider ?? "matching"} connection. <Link className="underline" href="/connections">Connect it first</Link>, then come back.</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <select className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm" value={pickedConnectionId} onChange={(event) => setPickedConnectionId(event.target.value)}>
                <option value="">Choose a connection</option>
                {compatibleConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>{connection.accountLabel ?? connection.provider}</option>
                ))}
              </select>
              <Button type="button" disabled={connecting || !pickedConnectionId} onClick={() => void connectConnection()}>{connecting ? "Saving..." : "Use this connection"}</Button>
            </div>
          )}
        </div>
      )}
      {action ? <FieldMapper fields={action.fields} triggerSchema={workflow.triggerSchema} value={config} onChange={setConfig} /> : null}
      {error ? <Notice className="mt-4" tone="error">{error}</Notice> : null}
      {message ? <Notice className="mt-4" tone="success">{message}</Notice> : null}
      <div className="flex gap-3">
        <Button disabled={saving || name.trim() === ""} onClick={() => void save()}>{saving ? "Saving..." : "Save changes"}</Button>
        {error?.includes("Refresh") ? <Button variant="outline" onClick={() => { setStatus("loading"); void refreshWorkflow(); }}>Refresh</Button> : null}
      </div>
      </Surface>
      <section className="border-t pt-6">
        {hasUnsavedChanges ? (
          <Notice className="mb-4" tone="warning" title="Save before testing">Save your changes before running a test so the displayed settings match the settings ZapFix executes.</Notice>
        ) : null}
        {!workflow.connectionId ? (
          <Notice className="mb-4" tone="warning" title="Choose a connection first">This workflow has no connection, so a test run will fail until you pick one above.</Notice>
        ) : null}
        <TriggerForm
          triggerSchema={workflow.triggerSchema}
          busy={running}
          disabled={hasUnsavedChanges || !workflow.connectionId}
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
