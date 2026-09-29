/** Fixture-backed adapters and AI are strictly limited to non-production test servers. */
export function e2eFixtureModeEnabled(
  env: { E2E_FIXTURE_ADAPTERS?: string; NODE_ENV?: string } = process.env,
): boolean {
  if (env.E2E_FIXTURE_ADAPTERS !== "1") return false;
  if (env.NODE_ENV === "production") {
    throw new Error("E2E fixture mode must never run in production.");
  }
  return true;
}
