import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { STATE_PATH, type E2eState } from "./support/global-setup";
import {
  assertRunFailed,
  diagnoseAndExpectFix,
  restorePreviousSetting,
  retryAndExpectSuccess,
  reviewAndConfirm,
  startBrokenCalendarRun,
} from "./support/recovery-flow";

/**
 * T29: the Calendar recovery loop, end to end, against the real app -- no live Google/Slack/
 * Anthropic calls (E2E_FIXTURE_ADAPTERS=1 swaps in recorded fixtures, see
 * server/adapters/registry.ts and server/diagnosis/index.ts).
 *
 * Scenario: the seeded workflow (tests/e2e/support/seed.ts) maps "Attendee email" from the
 * trigger's "email" field. Running it with "email" left blank reproduces the same missing-field
 * error the rules classify as a candidate fix: remap to "contact_email" instead, which the run
 * form fills with a real value (matches the recorded AI response in fixture-ai-client.ts). Three
 * separate seeded workflows, not one reused three times, so proposal/config-version state from
 * one scenario can't leak into another.
 */

const configured = existsSync(STATE_PATH);
const state = configured ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as E2eState) : null;

test("broken Calendar workflow: fails, gets diagnosed, approved, retried, and restored", async ({ page }) => {
  test.skip(!configured, "E2E_TEST_USER_ID/EMAIL/PASSWORD not set -- see docs/TASK_BRIEFS.md's T29 brief");

  await startBrokenCalendarRun(page, state!.calendarRecoveryWorkflowId);
  await assertRunFailed(page);
  // The rules' one candidate: remap Attendee email to the trigger's "Contact email" field, which
  // had a value in this run (server/diagnosis/rules/missing-required-field.ts).
  await diagnoseAndExpectFix(page, "Form field: contact_email");
  await reviewAndConfirm(page);
  await retryAndExpectSuccess(page);
  await restorePreviousSetting(page);
});

test("Calendar proposal can be rejected without applying a change", async ({ page }) => {
  test.skip(!configured, "E2E_TEST_USER_ID/EMAIL/PASSWORD not set -- see docs/TASK_BRIEFS.md's T29 brief");

  await startBrokenCalendarRun(page, state!.calendarRejectionWorkflowId);
  await assertRunFailed(page);
  await diagnoseAndExpectFix(page, "Form field: contact_email");

  await page.getByRole("button", { name: "Review and confirm" }).click();
  await page.getByRole("button", { name: "Reject" }).click();
  // No change was applied, and the (now-decided) proposal can't be re-approved.
  await expect(page.getByRole("heading", { name: "Change applied" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review and confirm" })).toBeDisabled();
});

test("Calendar proposal supports choosing and confirming a non-default option", async ({ page }) => {
  test.skip(!configured, "E2E_TEST_USER_ID/EMAIL/PASSWORD not set -- see docs/TASK_BRIEFS.md's T29 brief");

  // "Work email" also has a value in this run, so it is a second real candidate alongside the
  // AI's default pick (Contact email) -- see server/diagnosis/rules/missing-required-field.ts.
  await startBrokenCalendarRun(page, state!.calendarAlternateWorkflowId, { workEmail: "work@example.com" });
  await assertRunFailed(page);
  await diagnoseAndExpectFix(page, "Form field: contact_email");

  await page.getByRole("button", { name: "Review and confirm" }).click();
  await page.getByRole("button", { name: "Choose a different option" }).click();
  await page.getByLabel("Valid option").selectOption({ label: 'Use "Work email" for Attendee email' });
  await page.getByRole("button", { name: "Review and confirm" }).click();
  // Scoped to the dialog: the diagnosis panel behind it shows the same field/value text too.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Form field: work_email")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  // Scoped to "Change applied": the diagnosis panel behind it still shows the same field/value
  // text too (it isn't unmounted just because the proposal is now decided).
  const appliedChange = page.getByRole("region", { name: "Change applied" });
  await expect(appliedChange).toBeVisible();
  await expect(appliedChange.getByText("Form field: work_email")).toBeVisible();
});
