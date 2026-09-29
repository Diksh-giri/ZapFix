import type { AppId } from "@/lib/types";
import type { AppAdapter } from "./types";
import { createGoogleCalendarAdapter, googleCalendarAdapter } from "./google-calendar";
import { createSlackAdapter, slackAdapter } from "./slack";
import { createGoogleSheetsAdapter, googleSheetsAdapter } from "./google-sheets";
import { gmailAdapter } from "./gmail";
import { googleDriveAdapter } from "./google-drive";
import { AppError } from "@/lib/errors";
// T29: e2e tests exercise the real adapters against recorded fixtures instead of live Google/Slack
// calls. This has no side effect at import time (it just defines a function reading local fixture
// files); it only ever runs when E2E_FIXTURE_ADAPTERS=1, set solely by the e2e Playwright job.
import { fixtureFetch } from "../../tests/e2e/support/fixture-fetch";

/** The production registry. The fake adapter is deliberately NOT here; tests inject it. */
const adapters: Record<AppId, AppAdapter> = {
  google_calendar: googleCalendarAdapter,
  slack: slackAdapter,
  google_sheets: googleSheetsAdapter,
  gmail: gmailAdapter,
  google_drive: googleDriveAdapter,
};

const fixtureAdapters: Record<AppId, AppAdapter> = {
  ...adapters,
  google_calendar: createGoogleCalendarAdapter(fixtureFetch),
  slack: createSlackAdapter(fixtureFetch),
  google_sheets: createGoogleSheetsAdapter(fixtureFetch),
};

function activeAdapters(): Record<AppId, AppAdapter> {
  return process.env.E2E_FIXTURE_ADAPTERS === "1" ? fixtureAdapters : adapters;
}

export function getAdapter(app: AppId): AppAdapter {
  const adapter = activeAdapters()[app];
  if (!adapter) throw new AppError("not_found", `Unknown app "${app}"`);
  return adapter;
}

export function listAdapters(): AppAdapter[] {
  return Object.values(activeAdapters());
}
