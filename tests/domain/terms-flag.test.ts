import { describe, expect, it } from "vitest";
import { TERMS, termsPageEnabled } from "@/domain/legal/terms";

describe("Terms of Service page (round 8c, draft)", () => {
  it("stays off unless TERMS_PAGE_ENABLED is exactly true", () => {
    expect(termsPageEnabled({})).toBe(false);
    expect(termsPageEnabled({ TERMS_PAGE_ENABLED: "1" })).toBe(false);
    expect(termsPageEnabled({ TERMS_PAGE_ENABLED: "true" })).toBe(true);
  });
  it("carries no LAWYER note into the page text", () => {
    const text = JSON.stringify(TERMS);
    expect(text).not.toContain("LAWYER");
    expect(TERMS.sections.length).toBeGreaterThan(10);
  });
});
