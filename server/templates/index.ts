import type { AppId } from "@/lib/types";
import type { ActionConfig, TriggerSchema } from "@/lib/schemas/workflow-config";
import type { CreateWorkflowInput } from "@/server/workflows/service";

/**
 * A small, fixed set of ready-made workflows (T27), including deliberately broken ones that
 * double as test scenarios. Each template is instantiated through the normal workflow service
 * (create()), so its provider/ownership check and config validation still run -- this module
 * only supplies the app, action and field values, never a database write of its own.
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  app: AppId;
  actionKey: string;
  triggerSchema: TriggerSchema;
  actionConfig: ActionConfig;
  /** Whether running this template's defaults as-is is expected to fail (a real, documented error shape). */
  deliberatelyBroken: boolean;
}

const DEFAULT_TRIGGER: TriggerSchema = {
  fields: [
    { key: "title", label: "Title", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "date", label: "Date", type: "date" },
  ],
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "calendar-valid",
    name: "Create a calendar event",
    description:
      "A working example: creates a real event on your connected test calendar. Re-run it after your " +
      "Google connection's 7-day test window lapses to see the expired-connection recovery flow.",
    app: "google_calendar",
    actionKey: "create_event",
    triggerSchema: DEFAULT_TRIGGER,
    actionConfig: {
      title: { kind: "static", value: "ZapFix template event" },
      start: { kind: "static", value: "2030-06-15T10:00:00Z" },
      end: { kind: "static", value: "2030-06-15T11:00:00Z" },
      attendee_email: { kind: "static", value: "test@example.com" },
    },
    deliberatelyBroken: false,
  },
  {
    id: "calendar-missing-email",
    name: "Calendar: missing attendee email",
    description:
      "Deliberately broken: the attendee email is empty, which Google Calendar rejects (the same shape as " +
      "the recorded real fixture). Use it to see ZapFix explain and offer to fix a missing required field.",
    app: "google_calendar",
    actionKey: "create_event",
    triggerSchema: DEFAULT_TRIGGER,
    actionConfig: {
      title: { kind: "static", value: "ZapFix template event" },
      start: { kind: "static", value: "2030-06-15T10:00:00Z" },
      end: { kind: "static", value: "2030-06-15T11:00:00Z" },
      attendee_email: { kind: "static", value: "" },
    },
    deliberatelyBroken: true,
  },
  {
    id: "calendar-bad-date",
    name: "Calendar: wrong date format",
    description:
      "Deliberately broken: the start date is not in the format Google Calendar accepts (the same shape as " +
      "the recorded real fixture). Use it to see ZapFix explain and offer to fix an invalid value.",
    app: "google_calendar",
    actionKey: "create_event",
    triggerSchema: DEFAULT_TRIGGER,
    actionConfig: {
      title: { kind: "static", value: "ZapFix template event" },
      start: { kind: "static", value: "03/15/2030" },
      end: { kind: "static", value: "2030-06-15T11:00:00Z" },
      attendee_email: { kind: "static", value: "test@example.com" },
    },
    deliberatelyBroken: true,
  },
  {
    id: "gmail-missing-recipient",
    name: "Gmail: missing recipient",
    description:
      "Deliberately broken: the recipient is empty, which Gmail rejects (the same shape as the recorded real " +
      "fixture). Use it to see ZapFix explain and offer to fix a missing required field on a different app.",
    app: "gmail",
    actionKey: "send_email",
    triggerSchema: DEFAULT_TRIGGER,
    actionConfig: {
      to: { kind: "static", value: "" },
      subject: { kind: "static", value: "ZapFix template email" },
      body: { kind: "static", value: "This is a test email sent by a ZapFix template." },
    },
    deliberatelyBroken: true,
  },
  {
    id: "slack-valid",
    name: "Post a Slack message",
    description: "A working example: posts a real message to your connected test channel.",
    app: "slack",
    actionKey: "post_message",
    triggerSchema: DEFAULT_TRIGGER,
    actionConfig: {
      channel: { kind: "static", value: "#general-test" },
      text: { kind: "static", value: "Hello from a ZapFix template" },
    },
    deliberatelyBroken: false,
  },
];

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id);
}

/** Turns a template plus the caller's chosen connection into workflow-service create() input. */
export function instantiateTemplate(template: WorkflowTemplate, connectionId: string, name?: string): CreateWorkflowInput {
  return {
    name: name ?? template.name,
    app: template.app,
    actionKey: template.actionKey,
    connectionId,
    triggerSchema: template.triggerSchema,
    actionConfig: template.actionConfig,
  };
}
