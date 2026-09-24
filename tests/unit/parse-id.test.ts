import { describe, expect, it } from "vitest";
import { parseId } from "@/server/http/ids";

describe("parseId", () => {
  it("returns a valid uuid unchanged", () => {
    expect(parseId("0b8e9f3a-0c1a-4d0e-8a86-0d3a5f0f7c11")).toBe("0b8e9f3a-0c1a-4d0e-8a86-0d3a5f0f7c11");
  });

  it("answers not found, not a database error, for anything else", () => {
    for (const bad of ["abc", "", undefined, "1; select 1", "0b8e9f3a-0c1a-4d0e-8a86"]) {
      expect(() => parseId(bad, "Run")).toThrow(expect.objectContaining({ code: "not_found", message: "Run not found." }));
    }
  });
});
