import { existsSync, readFileSync } from "node:fs";
import { test } from "@playwright/test";
import { STATE_PATH, type E2eState } from "./support/global-setup";
import { runRecoveryLoop, signIn } from "./support/recovery-flow";

/**
 * T29: the same recovery loop as calendar-recovery.spec.ts, for Slack. No live Google/Slack/
 * Anthropic calls (E2E_FIXTURE_ADAPTERS=1 swaps in recorded fixtures).
 *
 * Scenario: the seeded workflow (tests/e2e/support/seed.ts) maps "Channel" from the trigger's
 * "channel" field. Running it with "channel" left blank reproduces the same missing-field error
 * the rules classify as a candidate fix: remap to "backup_channel" instead, which the run form
 * fills with a real value. That is the one candidate the rules propose (matches the recorded AI
 * response in tests/e2e/support/fixture-ai-client.ts).
 */

const configured = existsSync(STATE_PATH);
const { slackWorkflowId } = configured
  ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as E2eState)
  : { slackWorkflowId: "" };

test("broken Slack workflow: fails, gets diagnosed, approved, retried, and restored", async ({ page }) => {
  test.skip(!configured, "E2E_TEST_USER_ID/EMAIL/PASSWORD not set -- see docs/TASK_BRIEFS.md's T29 brief");

  await signIn(page, slackWorkflowId);

  const runForm = page.getByRole("group", { name: "Test data" });
  // The server requires every trigger field to be present (even empty) in the submitted data, not
  // merely absent -- an untouched, never-fill()ed input never enters React state as a key at all,
  // and fill("") on an already-empty input is a same-value no-op that fires no input event either.
  // Filling a character then clearing it forces a real change, which is the scenario under test.
  const channelField = runForm.getByLabel("Channel", { exact: true });
  await channelField.fill("x");
  await channelField.fill("");
  await runForm.getByLabel("Backup channel", { exact: true }).fill("e2e-test-alerts");

  // The run form requires every field natively; leaving "Channel" blank is the scenario under
  // test, so validation is turned off for this one submission rather than the field itself.
  await page.locator("form", { has: page.getByRole("button", { name: "Run test" }) }).evaluate(
    (form: HTMLFormElement) => { form.noValidate = true; },
  );
  await page.getByRole("button", { name: "Run test" }).click();

  // The rules' one candidate: remap Channel to the trigger's "Backup channel" field, which had a
  // value in this run (server/diagnosis/rules/missing-required-field.ts).
  await runRecoveryLoop(page, "Form field: backup_channel");
});
