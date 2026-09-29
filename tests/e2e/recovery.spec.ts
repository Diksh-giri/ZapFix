import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { STATE_PATH } from "./support/global-setup";

/**
 * T29: the full recovery loop, end to end, against the real app -- no live Google/Slack/Anthropic
 * calls (E2E_FIXTURE_ADAPTERS=1 swaps in recorded fixtures, see server/adapters/registry.ts and
 * server/diagnosis/index.ts). Calendar only for now; Slack and Sheets are a follow-up.
 *
 * Scenario: the seeded workflow (tests/e2e/support/seed.ts) maps "Attendee email" from the
 * trigger's "email" field. Running it with "email" left blank reproduces the same missing-field
 * error the rules classify as a candidate fix: remap to "contact_email" instead, which the run
 * form fills with a real value. That is the one candidate the rules propose (matches the recorded
 * AI response in tests/e2e/support/fixture-ai-client.ts).
 */

const configured = existsSync(STATE_PATH);
const { workflowId } = configured
  ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as { workflowId: string })
  : { workflowId: "" };

test("broken Calendar workflow: fails, gets diagnosed, approved, retried, and restored", async ({ page }) => {
  test.skip(!configured, "E2E_TEST_USER_ID/EMAIL/PASSWORD not set -- see docs/TASK_BRIEFS.md's T29 brief");
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;
  if (!email || !password) throw new Error("E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD are not set.");

  await page.goto(`/sign-in?next=${encodeURIComponent(`/workflows/${workflowId}`)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/workflows/${workflowId}$`));

  // The run form requires every field natively; leaving "Email" blank is the scenario under
  // test, so validation is turned off for this one submission rather than the field itself.
  await page.locator("form", { has: page.getByRole("button", { name: "Run test" }) }).evaluate(
    (form: HTMLFormElement) => { form.noValidate = true; },
  );
  await page.getByLabel("Title").fill("ZapFix e2e run");
  await page.getByLabel("Contact email").fill("backup@example.com");
  await page.getByRole("button", { name: "Run test" }).click();

  await expect(page.getByRole("heading", { name: "Latest test run" })).toBeVisible();
  await expect(page.getByText("Overall status: Failed")).toBeVisible();

  await page.getByRole("button", { name: "Diagnose" }).click();
  await expect(page.getByRole("heading", { name: "Diagnosis" })).toBeVisible();
  // The rules' one candidate: remap Attendee email to the trigger's "Contact email" field, which
  // had a value in this run (server/diagnosis/rules/missing-required-field.ts).
  await expect(page.getByText("Form field: contact_email")).toBeVisible();

  await page.getByRole("button", { name: "Review and confirm" }).click();
  await expect(page.getByRole("heading", { name: "Confirm this change" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Change applied" })).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("The retry succeeded")).toBeVisible();

  await page.getByRole("button", { name: "Restore previous setting" }).click();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByText("Previous setting restored")).toBeVisible();
});
