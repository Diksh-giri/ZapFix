import { describe, expect, it } from "vitest";
import { assertRetryAllowed, effectiveStatus, idempotencyKey } from "@/server/runs/engine";

const now = new Date("2026-09-23T12:00:00Z");
const STALE = 90_000;
const at = (msAgo: number) => new Date(now.getTime() - msAgo);

describe("run guards (Decision #010, safety test 11)", () => {
  it("marks a stale running attempt as uncertain", () => {
    expect(effectiveStatus({ status: "running", startedAt: at(10_000) }, now, STALE)).toBe("running");
    expect(effectiveStatus({ status: "running", startedAt: at(120_000) }, now, STALE)).toBe("uncertain");
  });

  it("allows retry of a failed attempt", () => {
    expect(() => assertRetryAllowed({ status: "failed", startedAt: at(1000) }, now, STALE)).not.toThrow();
  });

  it("blocks retry while running and after success", () => {
    expect(() => assertRetryAllowed({ status: "running", startedAt: at(1000) }, now, STALE)).toThrow(/already running/);
    expect(() => assertRetryAllowed({ status: "succeeded", startedAt: at(1000) }, now, STALE)).toThrow(/already succeeded/);
  });

  it("requires confirmation to retry an uncertain attempt", () => {
    const uncertain = { status: "uncertain" as const, startedAt: at(1000) };
    expect(() => assertRetryAllowed(uncertain, now, STALE)).toThrow(/not sure/);
    expect(() => assertRetryAllowed(uncertain, now, STALE, { confirmUncertain: true })).not.toThrow();
  });

  it("builds a stable idempotency key", () => {
    expect(idempotencyKey("r1", "action", 2)).toBe("r1:action:2");
  });
});
