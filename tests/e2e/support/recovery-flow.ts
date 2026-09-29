import { expect, type Page } from "@playwright/test";

/**
 * The part of the recovery loop every scenario shares once a run has failed: diagnose, review and
 * confirm the one proposed fix, retry, then restore. Factored out so the Calendar and Slack specs
 * (and Sheets, once it exists) can't drift apart on the steps that are actually identical.
 */
export async function runRecoveryLoop(page: Page, expectedFixText: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Latest test run" })).toBeVisible();
  await expect(page.getByText("Overall status: Failed")).toBeVisible();

  await page.getByRole("button", { name: "Diagnose" }).click();
  await expect(page.getByRole("heading", { name: "Diagnosis" })).toBeVisible();
  await expect(page.getByText(expectedFixText)).toBeVisible();

  await page.getByRole("button", { name: "Review and confirm" }).click();
  await expect(page.getByRole("heading", { name: "Confirm this change" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Change applied" })).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("The retry succeeded")).toBeVisible();

  await page.getByRole("button", { name: "Restore previous setting" }).click();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByText("Previous setting restored")).toBeVisible();
}

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
