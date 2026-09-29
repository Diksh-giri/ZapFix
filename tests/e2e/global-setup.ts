import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { seedCalendarWorkflow } from "./support/seed";

const STATE_DIR = path.join(process.cwd(), "tests", "e2e", ".state");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the guarded T29 E2E suite.`);
  return value;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  loadEnvConfig(process.cwd());
  if (process.env.CONFIRM_E2E !== "yes") {
    throw new Error("Refusing to run T29 E2E without CONFIRM_E2E=yes and a dedicated test account.");
  }

  const email = required("E2E_TEST_EMAIL");
  const password = required("E2E_TEST_PASSWORD");
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  required("DATABASE_URL");
  required("TOKEN_ENCRYPTION_KEY");

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Could not authenticate the dedicated E2E account: ${error?.message ?? "missing user"}`);
  }

  const scenarios = {
    recovery: await seedCalendarWorkflow(data.user.id),
    rejection: await seedCalendarWorkflow(data.user.id),
    alternate: await seedCalendarWorkflow(data.user.id),
  };
  await supabase.auth.signOut();

  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  chmodSync(STATE_DIR, 0o700);
  writeFileSync(path.join(STATE_DIR, "scenarios.json"), JSON.stringify(scenarios), { mode: 0o600 });

  const baseURL = String(config.projects[0]?.use.baseURL ?? "http://localhost:3000");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/sign-in?next=/workflows`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/workflows$/);
  const authPath = path.join(STATE_DIR, "auth.json");
  await page.context().storageState({ path: authPath });
  chmodSync(authPath, 0o600);
  await browser.close();
}
