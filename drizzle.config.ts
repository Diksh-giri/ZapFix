import { defineConfig } from "drizzle-kit";
import { getDatabaseUrl } from "./db/connection";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: { url: getDatabaseUrl({ required: false }) },
});
