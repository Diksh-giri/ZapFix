import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A `fetch` that answers Calendar/Slack requests from the recorded real fixtures
 * (tests/fixtures/**), so e2e tests exercise the real adapter's parsing of a real response
 * shape without ever calling Google or Slack (T29: "CI uses recorded fixtures, no live calls").
 * Which fixture to serve is decided the same way the real app would find out: by reading the
 * outbound request body, exactly as Google/Slack would.
 */

interface FixtureFile {
  response: { status: number; body: unknown };
}

function readFixture(app: string, scenario: string): FixtureFile["response"] {
  const filePath = path.join(__dirname, "..", "..", "fixtures", app, `${scenario}.json`);
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as FixtureFile;
  return parsed.response;
}

function jsonResponse(fixture: FixtureFile["response"], overrideBody?: Record<string, unknown>): Response {
  const body = overrideBody ? { ...(fixture.body as Record<string, unknown>), ...overrideBody } : fixture.body;
  return new Response(JSON.stringify(body), { status: fixture.status, headers: { "content-type": "application/json" } });
}

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const fixtureFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const body = bodyOf(init);

  if (url.startsWith("https://www.googleapis.com/calendar/")) {
    const email = (body.attendees as Array<{ email?: string }> | undefined)?.[0]?.email ?? "";
    const start = (body.start as { dateTime?: string } | undefined)?.dateTime ?? "";
    if (!email) return jsonResponse(readFixture("google-calendar", "empty_attendee_email"));
    if (!/^\d{4}-\d{2}-\d{2}T/.test(start)) return jsonResponse(readFixture("google-calendar", "invalid_date_format"));
    // A fresh-looking id per call; the fixture's own id would collide across repeated test runs.
    return jsonResponse(readFixture("google-calendar", "success"), { id: `e2etest${Date.now().toString(36)}` });
  }

  if (url.startsWith("https://slack.com/api/chat.postMessage")) {
    const channel = typeof body.channel === "string" ? body.channel : "";
    const text = typeof body.text === "string" ? body.text : "";
    if (!channel) return jsonResponse(readFixture("slack", "empty_channel"));
    if (!text) return jsonResponse(readFixture("slack", "empty_text"));
    return jsonResponse(readFixture("slack", "success"));
  }

  throw new Error(`fixtureFetch: no recorded fixture wired for ${url}`);
};
