import { mkdirSync, writeFileSync } from "node:fs";
import { createGoogleCalendarAdapter } from "../server/adapters/google-calendar";
import { sanitizeGoogleBody } from "../server/adapters/google-calendar/sanitize";

/**
 * Records REAL Google Calendar responses as sanitized fixtures (T11, step 5). Run it yourself, on a TEST calendar:
 *   GOOGLE_TEST_ACCESS_TOKEN=<short-lived token with the calendar.events.owned scope> npx tsx scripts/record-calendar-fixtures.ts
 * The token is used for this command only. It is never written to a file, and the sanitizer removes it (and emails,
 * quoted values and personal event fields) from everything saved. Review tests/fixtures/google-calendar/*.json before committing.
 * It creates one real event on the primary calendar and deletes it again.
 */
const token = process.env.GOOGLE_TEST_ACCESS_TOKEN;
if (!token) {
  console.error("Set GOOGLE_TEST_ACCESS_TOKEN for this command (a short-lived access token from a TEST Google account).");
  process.exit(1);
}

const good = {
  title: "ZapFix fixture test",
  start: "2030-01-15T10:00:00Z",
  end: "2030-01-15T11:00:00Z",
  attendee_email: "fixture-guest@example.com",
};

const scenarios: Array<{ name: string; description: string; values: Record<string, string>; token?: string }> = [
  { name: "success", description: "A valid event is created.", values: good },
  { name: "empty_attendee_email", description: "The attendee email is empty (missing required field).", values: { ...good, attendee_email: "" } },
  { name: "invalid_date_format", description: "The start date is 03/15/2026 instead of RFC 3339.", values: { ...good, start: "03/15/2026" } },
  { name: "invalid_token", description: "An expired or revoked access token.", values: good, token: "ya29.invalid-token-for-fixture" },
];

async function main() {
  mkdirSync("tests/fixtures/google-calendar", { recursive: true });
  for (const s of scenarios) {
    const useToken = s.token ?? token!;
    let captured: { status: number; body: unknown } | undefined;
    const capturingFetch: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      const body: unknown = await res.clone().json().catch(() => undefined);
      captured = { status: res.status, body };
      return res;
    };
    const result = await createGoogleCalendarAdapter(capturingFetch).execute("create_event", s.values, {
      accessToken: useToken,
      idempotencyKey: `fixture-${s.name}-${Date.now()}:action:1`,
      timeoutMs: 15_000,
    });

    const fixture = {
      scenario: s.name,
      description: s.description,
      recorded_at: new Date().toISOString().slice(0, 10),
      request_shape: result.requestSummary,
      response: { status: captured?.status ?? null, body: sanitizeGoogleBody(captured?.body, useToken) },
      mapped: result.ok ? { ok: true } : { ok: false, error: result.error },
    };
    writeFileSync(`tests/fixtures/google-calendar/${s.name}.json`, JSON.stringify(fixture, null, 2) + "\n");
    console.log(`${s.name.padEnd(22)} HTTP ${String(captured?.status).padEnd(4)} -> ${result.ok ? "ok" : result.error.category_hint}`);

    if (result.ok && s.name === "success") {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${result.externalRef}?sendUpdates=none`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
      console.log("  (test event deleted)");
    }
  }
  console.log("\nDone. Review tests/fixtures/google-calendar/*.json for anything personal before you commit.");
}

void main();
