import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Database tests (RLS, triggers) live in tests/db and need a real Postgres.
    // They are run separately: see docs/WORKING_AGREEMENT.md.
  },
});
