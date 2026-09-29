import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { seedCalendarWorkflow, seedSlackWorkflow } from "./seed";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/**
 * Runs once before the e2e suite (T29). Seeds one broken Calendar workflow and one broken Slack
 * workflow for the dedicated e2e test user and writes their ids to a JSON file specs read, since
 * Playwright's global setup can't hand data to tests directly.
 *
 * Needs E2E_TEST_USER_ID (the Supabase auth user id of a DEDICATED test user that has never
 * connected a real Google or Slack account -- see tests/e2e/support/seed.ts's safety notes) plus
 * E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD for the specs' own sign-in step.
 */
export const STATE_PATH = path.join(__dirname, "..", ".e2e-state.json");

export interface E2eState {
  calendarWorkflowId: string;
  slackWorkflowId: string;
}

/**
 * Does nothing (no seeding, the specs skip themselves) when the dedicated test user is not
 * configured, rather than failing the whole suite -- so `npm run e2e` still runs the plain
 * smoke test locally without CI's secrets.
 */
export default async function globalSetup(): Promise<void> {
  const userId = process.env.E2E_TEST_USER_ID;
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;
  if (!userId || !email || !password) {
    console.warn(
      "[e2e] E2E_TEST_USER_ID / E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD not set -- " +
        "skipping the recovery specs' seed step (see docs/TASK_BRIEFS.md's T29 brief).",
    );
    return;
  }

  const [calendar, slack] = await Promise.all([seedCalendarWorkflow(userId), seedSlackWorkflow(userId)]);
  const state: E2eState = { calendarWorkflowId: calendar.workflowId, slackWorkflowId: slack.workflowId };
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
