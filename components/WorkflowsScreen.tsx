"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { StatePanel } from "@/components/ui/state-panel";
import { FieldMapper } from "@/components/FieldMapper";
import type { ActionConfig, TriggerSchema } from "@/lib/schemas/workflow-config";
import type { AppCatalogItem, Workflow } from "@/lib/schemas/workflows";
import type { ClientConnection } from "@/lib/schemas/connections";
import { activeConnectionsFor, createWorkflow, loadWorkflowSetup, loadWorkflows } from "@/lib/workflows-client";
import { instantiateTemplate, WORKFLOW_TEMPLATES } from "@/server/templates";

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
  const [templateBusyId, setTemplateBusyId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

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

  async function startFromTemplate(templateId: string) {
    const template = WORKFLOW_TEMPLATES.find((item) => item.id === templateId);
    const templateApp = apps.find((item) => item.id === template?.app);
    if (!template || !templateApp) return;
    const connection = activeConnectionsFor(connections, templateApp.provider)[0];
    if (!connection) {
      setTemplateError(`Connect ${templateApp.provider} first, then try this template again.`);
      return;
    }
    setTemplateBusyId(templateId);
    setTemplateError(null);
    try {
      const created = await createWorkflow(instantiateTemplate(template, connection.id));
      router.push(`/workflows/${created.id}`);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "The template could not be created.");
      setTemplateBusyId(null);
    }
  }

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
      <PageHeader eyebrow="Automation" title="Workflows" description="Build one-trigger, one-action workflows using test accounts." actions={<Button type="button" onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? "Cancel" : "Create workflow"}
        </Button>} />

      <Notice tone="warning" title="Use test data">Actions run on your real connected accounts. Use a test calendar, channel, inbox, drive, or spreadsheet.</Notice>

      {status === "ready" ? (
        <Surface className="space-y-4">
          <SurfaceHeader title="Start from a template" description="Ready-made workflows, including a few deliberately broken ones, to try the recovery flow without building your own." />
          {templateError ? <Notice tone="error">{templateError}</Notice> : null}
          <ul className="grid gap-3 sm:grid-cols-2">
            {WORKFLOW_TEMPLATES.map((template) => (
              <li key={template.id} className="rounded-md border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{template.name}</span>
                  {template.deliberatelyBroken ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Deliberately broken</span> : null}
                </div>
                <p className="mt-1 text-sm text-neutral-600">{template.description}</p>
                <Button className="mt-3" type="button" variant="outline" disabled={templateBusyId !== null} onClick={() => void startFromTemplate(template.id)}>
                  {templateBusyId === template.id ? "Creating..." : "Use this template"}
                </Button>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      {showCreate ? (
        <Surface className="space-y-5">
        <form className="space-y-5" onSubmit={submit}>
          <SurfaceHeader title="New workflow" description="Choose an app, map its fields, and save before running a test." />
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
          {submitError ? <Notice tone="error">{submitError}</Notice> : null}
          <Button disabled={saving || !action} type="submit">{saving ? "Saving..." : "Save workflow"}</Button>
        </form>
        </Surface>
      ) : null}

      {status === "loading" ? <StatePanel state="loading" title="Loading workflows" description="Getting your latest workflow settings." compact /> : null}
      {status === "error" ? (
        <StatePanel state="error" title="Workflows could not be loaded" description="Your saved workflows were not changed." compact action={<Button variant="outline" onClick={() => { setStatus("loading"); void refreshWorkflows(); }}>Try again</Button>} />
      ) : null}
      {status === "ready" && workflows.length === 0 ? (
        <StatePanel state="empty" title="No workflows yet" description="Create one workflow to run your first safe test." action={<Button onClick={() => setShowCreate(true)}>Create workflow</Button>} />
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
