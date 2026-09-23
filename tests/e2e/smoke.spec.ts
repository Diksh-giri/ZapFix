import { expect, test } from "@playwright/test";

test("app is up", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

// TODO(T29): full loop for Calendar (connect a test Google account, run the broken workflow,
// diagnose, approve, retry, restore), then Slack and Sheets.
