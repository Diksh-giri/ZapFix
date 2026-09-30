import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { STATE_PATH, type E2eState } from "./support/global-setup";
import { signIn } from "./support/recovery-flow";

/**
 * T29: Sheets, end to end -- no live Google calls (E2E_FIXTURE_ADAPTERS=1).
 *
 * Unlike Calendar and Slack, this is not an approve/retry/restore test. Real recorded Google
 * Sheets calls (tests/fixtures/google-sheets/) confirmed that today's three rules
 * (missing_required_field, invalid_format, expired_connection) do not cover any of Sheets' actual
 * failure shapes: an empty required value succeeds silently, and an empty spreadsheet_id 404s
 * with a plain "not found" that matches none of them. So the real, current behavior for a broken
 * Sheets workflow is manual mode -- this spec verifies that behavior, not a fix that doesn't exist
 * yet in the app.
 */

const configured = existsSync(STATE_PATH);
const { sheetsWorkflowId } = configured
  ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as E2eState)
  : { sheetsWorkflowId: "" };

test("broken Sheets workflow: fails and correctly falls back to manual mode", async ({ page }) => {
  test.skip(!configured, "E2E_TEST_USER_ID/EMAIL/PASSWORD not set -- see docs/TASK_BRIEFS.md's T29 brief");

  await signIn(page, sheetsWorkflowId);

  // The one trigger field ("Note") is unused by SHEETS_ACTION_CONFIG (every action field there is
  // a fixed value) -- it exists only because a trigger schema needs at least one field.
  await page.getByRole("group", { name: "Test data" }).getByLabel("Note", { exact: true }).fill("e2e probe");
  await page.getByRole("button", { name: "Run test" }).click();

  await expect(page.getByRole("heading", { name: "Latest test run" })).toBeVisible();
  await expect(page.getByText("Overall status: Failed")).toBeVisible();

  await page.getByRole("button", { name: "Diagnose" }).click();
  // "Continue manually" appears twice (a sr-only heading and the visible Notice title) --
  // the unique text below it is enough to confirm manual mode rendered.
  await expect(page.getByText("ZapFix does not support this type of failure yet.")).toBeVisible();
  await expect(page.getByText("No change has been made.")).toBeVisible();

  // No "Review and confirm" -- there is genuinely no fix on offer for this failure.
  await expect(page.getByRole("button", { name: "Review and confirm" })).toHaveCount(0);
});
