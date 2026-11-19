import { describe, expect, it } from "vitest";
import {
  consentColumns,
  parseConsentCookie,
  serializeConsent,
} from "@/domain/consent";

describe("consent cookie", () => {
  it("round-trips a choice", () => {
    const value = serializeConsent({ analytics: true, marketing: false });
    expect(value).toBe('{"v":1,"analytics":true,"marketing":false}');
    expect(parseConsentCookie(value)).toEqual({ analytics: true, marketing: false });
  });

  it("reads a URL-encoded value, as browsers store it", () => {
    expect(parseConsentCookie(encodeURIComponent('{"v":1,"analytics":false,"marketing":true}'))).toEqual({
      analytics: false,
      marketing: true,
    });
  });

  it("treats anything unexpected as no choice", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "yes",
      "{}",
      '{"v":2,"analytics":true,"marketing":true}',
      '{"v":1,"analytics":"true","marketing":false}',
      '{"v":1,"analytics":true}',
      "x".repeat(500),
    ]) {
      expect(parseConsentCookie(raw)).toBeNull();
    }
  });

  it("drops fields it does not know", () => {
    expect(parseConsentCookie('{"v":1,"analytics":false,"marketing":false,"admin":true}')).toEqual({
      analytics: false,
      marketing: false,
    });
  });
});

describe("consentColumns", () => {
  it("stamps the choice with its time", () => {
    const now = new Date("2026-11-19T08:00:00Z");
    expect(consentColumns({ analytics: false, marketing: false }, now)).toEqual({
      consentAnalytics: false,
      consentMarketing: false,
      consentAt: now,
    });
  });
});
