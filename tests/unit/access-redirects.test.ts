import { describe, expect, it } from "vitest";
import { publicOrigin, safeNextPath } from "@/server/access/redirects";

describe("access redirects", () => {
  it("accepts only local next paths", () => {
    expect(safeNextPath("/workflows/123")).toBe("/workflows/123");
    expect(safeNextPath("https://evil.example")).toBe("/connections");
    expect(safeNextPath("//evil.example")).toBe("/connections");
    expect(safeNextPath(null)).toBe("/connections");
  });

  it("uses forwarded deployment headers for the callback origin", () => {
    const headers = new Headers({ "x-forwarded-host": "preview.example.com", "x-forwarded-proto": "https" });
    expect(publicOrigin(headers)).toBe("https://preview.example.com");
  });

  it("prefers Vercel's trusted deployment URL", () => {
    process.env.VERCEL_URL = "zapfix-preview.vercel.app";
    try {
      expect(publicOrigin(new Headers({ host: "untrusted.example" }))).toBe("https://zapfix-preview.vercel.app");
    } finally {
      delete process.env.VERCEL_URL;
    }
  });
});
