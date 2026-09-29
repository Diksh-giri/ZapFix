import { describe, expect, it } from "vitest";
import { e2eFixtureModeEnabled } from "@/server/e2e-fixture-mode";

describe("e2e fixture mode", () => {
  it("stays disabled unless explicitly enabled", () => {
    expect(e2eFixtureModeEnabled({ NODE_ENV: "test", E2E_FIXTURE_ADAPTERS: undefined })).toBe(false);
  });

  it("is available to the non-production Playwright server", () => {
    expect(e2eFixtureModeEnabled({ NODE_ENV: "development", E2E_FIXTURE_ADAPTERS: "1" })).toBe(true);
  });

  it("refuses to fabricate results in production", () => {
    expect(() => e2eFixtureModeEnabled({ NODE_ENV: "production", E2E_FIXTURE_ADAPTERS: "1" }))
      .toThrow("E2E fixture mode must never run in production.");
  });
});
