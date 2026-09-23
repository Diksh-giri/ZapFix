import { describe, expect, it } from "vitest";
import { validateAiOutput } from "@/server/diagnosis/ai/validate";

const candidates = [{ id: "map:attendee_email:contact_email" }];
const good = {
  likely_cause: "The email field was empty.",
  explanation: "The form did not provide an email, so the calendar could not invite anyone.",
  selected_candidate_id: "map:attendee_email:contact_email",
  why_this_fix: "It is the only email field in your form.",
  confidence: "high",
  uncertainty_note: null,
};

describe("validateAiOutput (safety test 9)", () => {
  it("accepts a valid answer, including JSON in code fences", () => {
    expect(validateAiOutput(good, candidates, "high").ok).toBe(true);
    expect(validateAiOutput("```json\n" + JSON.stringify(good) + "\n```", candidates, "high").ok).toBe(true);
  });

  it("rejects a fix that is not on the valid list", () => {
    const r = validateAiOutput({ ...good, selected_candidate_id: "invented" }, candidates, "high");
    expect(r).toEqual({ ok: false, reason: "selected fix is not on the valid list" });
  });

  it("rejects confidence above the rules' ceiling", () => {
    const r = validateAiOutput({ ...good, confidence: "high" }, candidates, "medium");
    expect(r.ok).toBe(false);
  });

  it("requires an uncertainty note when confidence is not high", () => {
    expect(validateAiOutput({ ...good, confidence: "medium", uncertainty_note: null }, candidates, "high").ok).toBe(false);
    expect(validateAiOutput({ ...good, confidence: "medium", uncertainty_note: "Two email fields exist." }, candidates, "high").ok).toBe(true);
  });

  it("allows no selection (null) when nothing fits", () => {
    const r = validateAiOutput(
      { ...good, selected_candidate_id: null, confidence: "low", uncertainty_note: "Not sure." },
      candidates,
      "medium",
    );
    expect(r.ok).toBe(true);
  });

  it("rejects bad JSON and wrong shapes", () => {
    expect(validateAiOutput("not json", candidates, "high").ok).toBe(false);
    expect(validateAiOutput({ nope: 1 }, candidates, "high").ok).toBe(false);
  });
});
