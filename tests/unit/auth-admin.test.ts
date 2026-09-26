import { describe, expect, it } from "vitest";
import { isExistingAuthUserError } from "@/server/access/auth-admin";

describe("auth admin errors", () => {
  it("recognizes both documented existing-user codes", () => {
    expect(isExistingAuthUserError({ code: "email_exists", message: "hidden" })).toBe(true);
    expect(isExistingAuthUserError({ code: "user_already_exists", message: "hidden" })).toBe(true);
  });

  it("does not suppress unrelated admin failures", () => {
    expect(isExistingAuthUserError({ code: "unexpected_failure", message: "hidden" })).toBe(false);
  });
});
