import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, workflowId: string): Promise<void> {
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;
  if (!email || !password) throw new Error("E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD are not set.");

  await page.goto(`/sign-in?next=${encodeURIComponent(`/workflows/${workflowId}`)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/workflows/${workflowId}$`));
}

/**
 * Signs in and runs the seeded Calendar workflow (tests/e2e/support/seed.ts) with "Email" left
 * blank -- the missing-field scenario under test. "Contact email" always has a value, so it is
 * always a candidate; "Work email" only gets one when `workEmail` is passed, so scenarios that
 * don't need a second candidate keep the rules' output at exactly one option (matching the
 * recorded AI response in fixture-ai-client.ts, which always proposes contact_email as default).
 */
export async function startBrokenCalendarRun(page: Page, workflowId: string, opts: { workEmail?: string } = {}): Promise<void> {
  await signIn(page, workflowId);

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
  const workEmailField = runForm.getByLabel("Work email", { exact: true });
  if (opts.workEmail) {
    await workEmailField.fill(opts.workEmail);
  } else {
    await workEmailField.fill("x");
    await workEmailField.fill("");
  }

  // The run form requires every field natively; leaving "Email" blank is the scenario under
  // test, so validation is turned off for this one submission rather than the field itself.
  await page.locator("form", { has: page.getByRole("button", { name: "Run test" }) }).evaluate(
    (form: HTMLFormElement) => { form.noValidate = true; },
  );
  await page.getByRole("button", { name: "Run test" }).click();
}

export async function assertRunFailed(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Latest test run" })).toBeVisible();
  await expect(page.getByText("Overall status: Failed")).toBeVisible();
}

export async function diagnoseAndExpectFix(page: Page, expectedFixText: string): Promise<void> {
  await page.getByRole("button", { name: "Diagnose" }).click();
  await expect(page.getByRole("heading", { name: "Diagnosis" })).toBeVisible();
  await expect(page.getByText(expectedFixText)).toBeVisible();
}

export async function reviewAndConfirm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Review and confirm" }).click();
  await expect(page.getByRole("heading", { name: "Confirm this change" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change applied" })).toBeVisible();
}

export async function retryAndExpectSuccess(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("The retry succeeded")).toBeVisible();
}

export async function restorePreviousSetting(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Restore previous setting" }).click();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByText("Previous setting restored")).toBeVisible();
}

/**
 * The part of the recovery loop every scenario shares once a run has failed: diagnose, review and
 * confirm the one proposed fix, retry, then restore. Factored out so the Calendar and Slack specs
 * can't drift apart on the steps that are actually identical.
 */
export async function runRecoveryLoop(page: Page, expectedFixText: string): Promise<void> {
  await assertRunFailed(page);
  await diagnoseAndExpectFix(page, expectedFixText);
  await reviewAndConfirm(page);
  await retryAndExpectSuccess(page);
  await restorePreviousSetting(page);
}
