import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // Next's dev server compiles each route on its first request; under several parallel workers
  // hitting different routes at once, that first hit can take longer than the 5s default.
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/support/global-setup.ts",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        // Never reuse an already-running dev server: it would not have E2E_FIXTURE_ADAPTERS set,
        // so e2e would silently make real Google/Slack/Anthropic calls instead of using fixtures.
        reuseExistingServer: false,
        // Recorded fixtures stand in for Google/Slack/Anthropic -- see server/adapters/registry.ts
        // and server/diagnosis/index.ts. No effect on a dev server started any other way.
        env: { E2E_FIXTURE_ADAPTERS: "1" },
      },
});
