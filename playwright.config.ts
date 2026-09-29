import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: "tests/e2e/.state/auth.json",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        env: { E2E_FIXTURE_ADAPTERS: "1" },
        url: "http://localhost:3000",
        reuseExistingServer: false,
      },
});
