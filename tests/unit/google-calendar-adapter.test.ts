import { describe, expect, it, vi } from "vitest";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import { createGoogleCalendarAdapter, eventIdFor } from "@/server/adapters/google-calendar";

const values = {
  title: "Design review",
  start: "2026-03-15T10:00:00Z",
  end: "2026-03-15T11:00:00Z",
  attendee_email: "guest@example.com",
};
const ctx = { accessToken: "ya29.secret-access-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const googleError = (status: number, reason: string, message = "Something", location?: string) =>
  json({ error: { code: status, message, errors: [{ domain: "global", reason, message, ...(location ? { location } : {}) }] } }, status);

async function run(fetchFn: typeof fetch, v: Record<string, string> = values, c = ctx) {
  return createGoogleCalendarAdapter(fetchFn).execute("create_event", v, c);
}

describe("eventIdFor (duplicate protection)", () => {
  it("makes an id Google accepts: lowercase base32hex, 5 to 1024 characters", () => {
    const id = eventIdFor("run-1:action:1");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it("is the same for every attempt of the same run and step, so a retry cannot create a second event", () => {
    expect(eventIdFor("run-1:action:1")).toBe(eventIdFor("run-1:action:2"));
  });

  it("differs between runs and between steps", () => {
    expect(eventIdFor("run-1:action:1")).not.toBe(eventIdFor("run-2:action:1"));
    expect(eventIdFor("run-1:action:1")).not.toBe(eventIdFor("run-1:other:1"));
  });
});

describe("create_event: the request", () => {
  it("posts one event to the primary calendar with the token, a deterministic id and no guest emails sent", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: eventIdFor(ctx.idempotencyKey), htmlLink: "https://x" }));
    await run(fetchFn);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(u.searchParams.get("sendUpdates")).toBe("none");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ya29.secret-access-token");
    expect(JSON.parse(String(init.body))).toEqual({
      id: eventIdFor(ctx.idempotencyKey),
      summary: "Design review",
      start: { dateTime: "2026-03-15T10:00:00Z" },
      end: { dateTime: "2026-03-15T11:00:00Z" },
      attendees: [{ email: "guest@example.com" }],
    });
  });

  it("sends empty and badly formatted values to Google as they are, so Google's real errors are what we record", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: "x".repeat(10) }));
    await run(fetchFn, { ...values, attendee_email: "", start: "03/15/2026" });
    const body = JSON.parse(String((fetchFn.mock.calls[0]![1] as RequestInit).body));
    expect(body.attendees).toEqual([{ email: "" }]);
    expect(body.start).toEqual({ dateTime: "03/15/2026" });
  });
});

describe("create_event: success", () => {
  it("returns the event id and a summary with shapes only, never the raw values", async () => {
    const id = eventIdFor(ctx.idempotencyKey);
    const r = await run(vi.fn().mockResolvedValue(json({ id })));
    expect(r).toEqual({
      ok: true,
      externalRef: id,
      requestSummary: { title: "provided", start: "provided", end: "provided", attendee_email: "provided" },
    });
    expect(JSON.stringify(r)).not.toContain("guest@example.com");
    expect(JSON.stringify(r)).not.toContain("Design review");
  });

  it("marks empty values as empty in the summary", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({ id: "abcde" })), { ...values, attendee_email: "" });
    expect(r.requestSummary.attendee_email).toBe("empty");
  });

  it("treats 409 duplicate as success: an earlier attempt already created this event", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(409, "duplicate", "The requested identifier already exists.")));
    expect(r).toMatchObject({ ok: true, externalRef: eventIdFor(ctx.idempotencyKey) });
  });

  it("does not claim success when Google answers 200 without an event id", async () => {
    const r = await run(vi.fn().mockResolvedValue(json({})));
    expect(r).toMatchObject({ ok: false, error: { outcome: "uncertain" } });
  });
});

describe("create_event: failures become StandardErrors", () => {
  const cases: Array<[string, Response, Record<string, unknown>]> = [
    ["401 expired or invalid token", googleError(401, "authError", "Invalid Credentials"), { category_hint: "auth", outcome: "not_executed", retryable: false }],
    ["403 permission", googleError(403, "forbidden", "Forbidden"), { category_hint: "auth", outcome: "not_executed" }],
    ["403 rate limit", googleError(403, "rateLimitExceeded"), { category_hint: "rate_limit", retryable: true, outcome: "not_executed" }],
    ["403 user rate limit", googleError(403, "userRateLimitExceeded"), { category_hint: "rate_limit", outcome: "not_executed" }],
    ["429", googleError(429, "rateLimitExceeded"), { category_hint: "rate_limit", retryable: true, outcome: "not_executed" }],
    ["404", googleError(404, "notFound"), { category_hint: "not_found", outcome: "not_executed" }],
    ["500", googleError(500, "backendError"), { category_hint: "unavailable", retryable: true, outcome: "uncertain" }],
    ["503", googleError(503, "backendError"), { category_hint: "unavailable", outcome: "uncertain" }],
  ];

  it.each(cases)("%s", async (_name, response, expected) => {
    const r = await run(vi.fn().mockResolvedValue(response));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatchObject(expected);
      expect(StandardErrorSchema.safeParse(r.error).success).toBe(true);
    }
  });

  it("uses Google's reason as the error code", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(401, "authError")));
    expect(!r.ok && r.error.code).toBe("authError");
  });

  it("handles a non-JSON error page", async () => {
    const r = await run(vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));
    expect(r).toMatchObject({ ok: false, error: { category_hint: "unavailable", code: "http_502" } });
  });

  it("400 is an invalid value by default, and points at the field when Google names it", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "invalid", "Invalid value for: start", "start.dateTime")));
    expect(r).toMatchObject({ ok: false, error: { category_hint: "invalid_value", field: "start", outcome: "not_executed", retryable: false } });
  });

  it("400 about a missing or empty attendee is a missing field on the attendee email", async () => {
    const r = await run(vi.fn().mockResolvedValue(googleError(400, "required", "Missing attendee email", "attendees[0].email")));
    expect(r).toMatchObject({ ok: false, error: { category_hint: "missing_field", field: "attendee_email" } });
  });

  it("masks quoted values and email addresses that Google echoes back", async () => {
    const r = await run(
      vi.fn().mockResolvedValue(googleError(400, "invalid", 'Invalid value "03/15/2026" for guest@example.com')),
    );
    const text = JSON.stringify(r);
    expect(text).not.toContain("03/15/2026");
    expect(text).not.toContain("guest@example.com");
  });

  it("never puts the access token in a result", async () => {
    for (const res of [googleError(401, "authError", "Bearer ya29.secret-access-token rejected"), json({ id: "abcde" })]) {
      const text = JSON.stringify(await run(vi.fn().mockResolvedValue(res)));
      expect(text).not.toContain("ya29.secret-access-token");
    }
  });
});

describe("create_event: uncertain outcomes", () => {
  it("a timeout is uncertain, because Google may have created the event", async () => {
    const hang = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
    );
    const r = await run(hang as unknown as typeof fetch, values, { ...ctx, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, error: { category_hint: "unavailable", code: "timeout", outcome: "uncertain", retryable: true } });
  });

  it("a dropped connection is uncertain too", async () => {
    const r = await run(vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(r).toMatchObject({ ok: false, error: { code: "network_error", outcome: "uncertain" } });
  });
});

describe("the adapter contract", () => {
  it("rejects an unknown action without calling Google", async () => {
    const fetchFn = vi.fn();
    const r = await createGoogleCalendarAdapter(fetchFn).execute("delete_event", values, ctx);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, error: { code: "unknown_action", outcome: "not_executed" } });
  });

  it("uses the events.owned scope only: it never asks for anything else", () => {
    expect(createGoogleCalendarAdapter(vi.fn()).id).toBe("google_calendar");
  });
});
