"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldMapper } from "@/components/FieldMapper";
import type { ActionConfig, TriggerSchema } from "@/lib/schemas/workflow-config";
import type { AppCatalogItem, Workflow } from "@/lib/schemas/workflows";
import type { ClientConnection } from "@/lib/schemas/connections";
import { activeConnectionsFor, createWorkflow, loadWorkflowSetup, loadWorkflows } from "@/lib/workflows-client";

const DEFAULT_TRIGGER: TriggerSchema = {
  fields: [
    { key: "title", label: "Title", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "date", label: "Date", type: "date" },
  ],
};
const SHEETS_TRIGGER: TriggerSchema = {
  fields: [
    ...DEFAULT_TRIGGER.fields,
    { key: "row_values", label: "Row values", type: "text_list" },
  ],
};
const inputClass = "h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm";

function emptyConfig(fields: Array<{ key: string }>): ActionConfig {
  return Object.fromEntries(fields.map((field) => [field.key, { kind: "static", value: "" }]));
}

export function isRunnableApp(app: AppCatalogItem): boolean {
  return app.actions.length > 0;
}

export function triggerSchemaFor(appId: AppCatalogItem["id"]): TriggerSchema {
  return appId === "google_sheets" ? SHEETS_TRIGGER : DEFAULT_TRIGGER;
}

export function WorkflowsScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [apps, setApps] = useState<AppCatalogItem[]>([]);
  const [connections, setConnections] = useState<ClientConnection[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const [actionKey, setActionKey] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [actionConfig, setActionConfig] = useState<ActionConfig>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refreshWorkflows = useCallback(async () => {
    try {
      const [items, setup] = await Promise.all([loadWorkflows(), loadWorkflowSetup()]);
      setWorkflows(items);
      setApps(setup.apps.filter(isRunnableApp));
      setConnections(setup.connections);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // The page owns this client-side request; state updates happen only after the promises settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshWorkflows();
  }, [refreshWorkflows]);

  const app = apps.find((item) => item.id === appId);
  const action = app?.actions.find((item) => item.key === actionKey);
  const compatibleConnections = useMemo(
    () => app ? activeConnectionsFor(connections, app.provider) : [],
    [app, connections],
  );

  function chooseApp(nextId: string) {
    const next = apps.find((item) => item.id === nextId);
    const nextAction = next?.actions[0];
    setAppId(nextId);
    setActionKey(nextAction?.key ?? "");
    setConnectionId("");
    setActionConfig(emptyConfig(nextAction?.fields ?? []));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!app || !action) return;
    if (!connectionId) {
      setSubmitError("Connect the required app, then choose its active connection.");
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      const created = await createWorkflow({
        name, app: app.id, actionKey: action.key, connectionId,
        triggerSchema: triggerSchemaFor(app.id), actionConfig,
      });
      router.push(`/workflows/${created.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "The workflow could not be created.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="mt-2 text-sm text-neutral-600">Build one-trigger, one-action workflows using test accounts.</p>
        </div>
        <Button type="button" onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? "Cancel" : "Create workflow"}
        </Button>
      </header>

      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Actions run on your real connected accounts. Use a test calendar, channel, inbox, drive, or spreadsheet.
      </p>

      {showCreate ? (
        <form className="space-y-5 rounded-lg border p-5" onSubmit={submit}>
          <h2 className="text-lg font-semibold">New workflow</h2>
          <label className="block text-sm font-medium">Name
            <input className={`mt-1 ${inputClass}`} maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">App
              <select className={`mt-1 ${inputClass}`} required value={appId} onChange={(event) => chooseApp(event.target.value)}>
                <option value="">Choose an app</option>
                {apps.map((item) => <option key={item.id} value={item.id}>{item.id.replaceAll("_", " ")}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Action
              <select className={`mt-1 ${inputClass}`} required value={actionKey} onChange={(event) => {
                const nextKey = event.target.value;
                setActionKey(nextKey);
                setActionConfig(emptyConfig(app?.actions.find((item) => item.key === nextKey)?.fields ?? []));
              }}>
                {(app?.actions ?? []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
          </div>
          {app ? (
            <label className="block text-sm font-medium">Connection
              <select className={`mt-1 ${inputClass}`} required value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
                <option value="">Choose an active connection</option>
                {compatibleConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>{connection.accountLabel ?? app.provider}</option>
                ))}
              </select>
              {compatibleConnections.length === 0 ? <span className="mt-1 block text-sm text-red-700">No active connection. Connect this app first.</span> : null}
            </label>
          ) : null}
          {action && app ? <FieldMapper fields={action.fields} triggerSchema={triggerSchemaFor(app.id)} value={actionConfig} onChange={setActionConfig} /> : null}
          {submitError ? <p role="alert" className="text-sm text-red-700">{submitError}</p> : null}
          <Button disabled={saving || !action} type="submit">{saving ? "Saving..." : "Save workflow"}</Button>
        </form>
      ) : null}

      {status === "loading" ? <p role="status" className="text-sm text-neutral-600">Loading workflows...</p> : null}
      {status === "error" ? (
        <div className="rounded-lg border border-red-200 p-4" role="alert">
          <p className="text-sm text-red-800">Workflows could not be loaded.</p>
          <Button className="mt-3" variant="outline" onClick={() => { setStatus("loading"); void refreshWorkflows(); }}>Try again</Button>
        </div>
      ) : null}
      {status === "ready" && workflows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-neutral-600">No workflows yet. Create one to run your first test.</p>
      ) : null}
      {status === "ready" && workflows.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              <Link className="block p-4 hover:bg-neutral-50" href={`/workflows/${workflow.id}`}>
                <span className="font-medium">{workflow.name}</span>
                <span className="mt-1 block text-sm text-neutral-600">{workflow.app.replaceAll("_", " ")} · Version {workflow.configVersion}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
