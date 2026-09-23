import type { AppId } from "@/lib/types";
import type { AppAdapter } from "./types";
import { googleCalendarAdapter } from "./google-calendar";
import { slackAdapter } from "./slack";
import { googleSheetsAdapter } from "./google-sheets";
import { AppError } from "@/lib/errors";

/** The production registry. The fake adapter is deliberately NOT here; tests inject it. */
const adapters: Record<AppId, AppAdapter> = {
  google_calendar: googleCalendarAdapter,
  slack: slackAdapter,
  google_sheets: googleSheetsAdapter,
};

export function getAdapter(app: AppId): AppAdapter {
  const adapter = adapters[app];
  if (!adapter) throw new AppError("not_found", `Unknown app "${app}"`);
  return adapter;
}

export function listAdapters(): AppAdapter[] {
  return Object.values(adapters);
}
