import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

interface Scenarios {
  recovery: { workflowId: string };
  rejection: { workflowId: string };
  alternate: { workflowId: string };
}

let scenarios: Scenarios;

test.beforeAll(() => {
  scenarios = JSON.parse(
    readFileSync(path.join(process.cwd(), "tests", "e2e", ".state", "scenarios.json"), "utf8"),
  ) as Scenarios;
});

async function startBrokenCalendarRun(page: Page, workflowId: string): Promise<void> {
  await page.goto(`/workflows/${workflowId}`);
  await expect(page.getByRole("heading", { name: "Edit workflow" })).toBeVisible();
  await page.getByLabel("Title").fill("T29 recovery test");
  // The controlled fixture intentionally exercises a missing required mapping. The normal form
  // requires each trigger field, so remove only this browser constraint for the fixture run.
  await page.getByLabel("Email").evaluate((input) => input.removeAttribute("required"));
  await page.getByLabel("Contact email").fill("contact@example.com");
  await page.getByLabel("Work email").fill("work@example.com");
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText("Overall status:")).toContainText("Failed");
}

async function diagnose(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Diagnose" }).click();
  await expect(page.getByRole("heading", { name: "Diagnosis" })).toBeVisible();
  await expect(page.getByText("No change will be made unless you confirm.")).toBeVisible();
}

test("app is up", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

test("Calendar failure can be diagnosed, approved, retried, and restored", async ({ page }) => {
  await startBrokenCalendarRun(page, scenarios.recovery.workflowId);
  await diagnose(page);

  await page.getByRole("button", { name: "Review and confirm" }).click();
  await expect(page.getByRole("heading", { name: "Confirm this change" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change applied" })).toBeVisible();

  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("The retry succeeded")).toBeVisible();

  await page.getByRole("button", { name: "Restore previous setting" }).click();
  await expect(page.getByRole("heading", { name: "Restore the previous setting?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByText("Previous setting restored")).toBeVisible();
});

test("Calendar proposal can be rejected without applying a change", async ({ page }) => {
  await startBrokenCalendarRun(page, scenarios.rejection.workflowId);
  await diagnose(page);

  await page.getByRole("button", { name: "Review and confirm" }).click();
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("button", { name: "Review and confirm" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Change applied" })).toHaveCount(0);
});

test("Calendar proposal supports choosing and confirming a non-default option", async ({ page }) => {
  await startBrokenCalendarRun(page, scenarios.alternate.workflowId);
  await diagnose(page);

  await page.getByRole("button", { name: "Review and confirm" }).click();
  await page.getByRole("button", { name: "Choose a different option" }).click();
  await page.getByLabel("Valid option").selectOption({ label: 'Use "Work email" for Attendee email' });
  await page.getByRole("button", { name: "Review and confirm" }).click();
  await expect(page.getByText("Form field: work_email")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change applied" })).toBeVisible();
  await expect(page.getByText("Form field: work_email")).toBeVisible();
});
