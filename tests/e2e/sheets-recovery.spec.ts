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

  // No trigger fields to fill -- every action field is a fixed value (see seed.ts's
  // SHEETS_ACTION_CONFIG), so the run form has nothing to enter.
  await page.getByRole("button", { name: "Run test" }).click();

  await expect(page.getByRole("heading", { name: "Latest test run" })).toBeVisible();
  await expect(page.getByText("Overall status: Failed")).toBeVisible();

  await page.getByRole("button", { name: "Diagnose" }).click();
  await expect(page.getByText("Continue manually")).toBeVisible();
  await expect(page.getByText("ZapFix does not support this type of failure yet.")).toBeVisible();
  await expect(page.getByText("No change has been made.")).toBeVisible();

  // No "Review and confirm" -- there is genuinely no fix on offer for this failure.
  await expect(page.getByRole("button", { name: "Review and confirm" })).toHaveCount(0);
});
