import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createGoogleCalendarAdapter } from "@/server/adapters/google-calendar";

/** Replays the REAL Google responses recorded by scripts/record-calendar-fixtures.ts through the adapter. */
const good = { title: "t", start: "2030-01-15T10:00:00Z", end: "2030-01-15T11:00:00Z", attendee_email: "a@example.com" };
const scenarios: Record<string, Record<string, string>> = {
  success: good,
  empty_attendee_email: { ...good, attendee_email: "" },
  invalid_date_format: { ...good, start: "03/15/2026" },
  invalid_token: good,
};

function load(name: string) {
  return JSON.parse(readFileSync(`tests/fixtures/google-calendar/${name}.json`, "utf8")) as {
    response: { status: number; body: unknown };
    mapped: { ok: boolean; error?: Record<string, unknown> };
  };
}

async function replay(name: string) {
  const f = load(name);
  const fetchFn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(f.response.body), { status: f.response.status, headers: { "content-type": "application/json" } }),
  );
  const r = await createGoogleCalendarAdapter(fetchFn).execute("create_event", scenarios[name]!, {
    accessToken: "ya29.replay-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000,
  });
  return { r, f };
}

describe("real Google responses (recorded fixtures)", () => {
  it("an empty attendee email is a MISSING field on attendee_email, which is what the missing-field rule needs", async () => {
    const { r } = await replay("empty_attendee_email");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "attendee_email", outcome: "not_executed", retryable: false } });
  });

  it("a badly formatted date is an invalid value on the field that is not RFC 3339, even though Google names no field", async () => {
    const { r } = await replay("invalid_date_format");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "invalid_value", field: "start", outcome: "not_executed" } });
  });

  it("an invalid token is an auth failure that was not executed", async () => {
    const { r } = await replay("invalid_token");
    expect(r).toMatchObject({ ok: false, error: { category_hint: "auth", code: "authError", outcome: "not_executed" } });
  });

  it("a real success response gives the event id", async () => {
    const { r, f } = await replay("success");
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.externalRef).toBe((f.response.body as { id: string }).id);
  });

  it.each(Object.keys(scenarios))("%s: the saved 'mapped' result matches what the adapter produces today", async (name) => {
    const { r, f } = await replay(name);
    expect(f.mapped.ok).toBe(r.ok);
    if (!r.ok) expect(f.mapped.error).toEqual(r.error);
  });

  it("holds no personal data or tokens", () => {
    for (const name of Object.keys(scenarios)) {
      const text = readFileSync(`tests/fixtures/google-calendar/${name}.json`, "utf8");
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // no email addresses
      expect(text).not.toMatch(/ya29\.|Bearer\s+\w/); // no tokens
      expect(text).not.toMatch(/htmlLink|"creator"|"organizer"|"attendees"/);
    }
  });
});
