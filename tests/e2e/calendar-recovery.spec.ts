import { existsSync, readFileSync } from "node:fs";
import { test } from "@playwright/test";
import { STATE_PATH, type E2eState } from "./support/global-setup";
import { runRecoveryLoop, signIn } from "./support/recovery-flow";

/**
 * T29: the full recovery loop, end to end, against the real app -- no live Google/Slack/Anthropic
 * calls (E2E_FIXTURE_ADAPTERS=1 swaps in recorded fixtures, see server/adapters/registry.ts and
 * server/diagnosis/index.ts).
 *
 * Scenario: the seeded workflow (tests/e2e/support/seed.ts) maps "Attendee email" from the
 * trigger's "email" field. Running it with "email" left blank reproduces the same missing-field
 * error the rules classify as a candidate fix: remap to "contact_email" instead, which the run
 * form fills with a real value. That is the one candidate the rules propose (matches the recorded
 * AI response in tests/e2e/support/fixture-ai-client.ts).
 */

const configured = existsSync(STATE_PATH);
const { calendarWorkflowId } = configured
  ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as E2eState)
  : { calendarWorkflowId: "" };

test("broken Calendar workflow: fails, gets diagnosed, approved, retried, and restored", async ({ page }) => {
  test.skip(!configured, "E2E_TEST_USER_ID/EMAIL/PASSWORD not set -- see docs/TASK_BRIEFS.md's T29 brief");

  await signIn(page, calendarWorkflowId);

  // Scoped to the "Test data" group: the field mapper above it also has a control whose
  // accessible name contains "Title", so an unscoped getByLabel("Title") is ambiguous.
  const runForm = page.getByRole("group", { name: "Test data" });
  await runForm.getByLabel("Title", { exact: true }).fill("ZapFix e2e run");
  // The server requires every trigger field to be present (even empty) in the submitted data, not
  // merely absent -- an untouched, never-fill()ed input never enters React state as a key at all,
  // and fill("") on an already-empty input is a same-value no-op that fires no input event either.
  // Filling a character then clearing it forces a real change, which is the scenario under test.
  const emailField = runForm.getByLabel("Email", { exact: true });
  await emailField.fill("x");
  await emailField.fill("");
  await runForm.getByLabel("Contact email", { exact: true }).fill("backup@example.com");

  // The run form requires every field natively; leaving "Email" blank is the scenario under
  // test, so validation is turned off for this one submission rather than the field itself.
  await page.locator("form", { has: page.getByRole("button", { name: "Run test" }) }).evaluate(
    (form: HTMLFormElement) => { form.noValidate = true; },
  );
  await page.getByRole("button", { name: "Run test" }).click();

  // The rules' one candidate: remap Attendee email to the trigger's "Contact email" field, which
  // had a value in this run (server/diagnosis/rules/missing-required-field.ts).
  await runRecoveryLoop(page, "Form field: contact_email");
});
