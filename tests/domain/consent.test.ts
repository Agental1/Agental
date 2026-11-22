import { describe, expect, it } from "vitest";
import {
  CONSENT_POLICY_VERSION,
  consentColumns,
  parseConsentCookie,
  serializeConsent,
} from "@/domain/consent";
import { POLICY_VERSION, consentNeedsAnswer } from "@/components/consent/consent-cookie";

describe("consent cookie", () => {
  it("round-trips a choice", () => {
    const value = serializeConsent({ analytics: true, marketing: false }, new Date("2026-11-21T10:00:00Z"));
    expect(value).toBe(
      `{"v":1,"analytics":true,"marketing":false,"at":"2026-11-21T10:00:00.000Z","pv":"${CONSENT_POLICY_VERSION}"}`
    );
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
      consentVersion: CONSENT_POLICY_VERSION,
    });
  });
});

describe("cookie banner", () => {
  it("uses the same notice version in the browser and on the server", () => {
    expect(POLICY_VERSION).toBe(CONSENT_POLICY_VERSION);
  });

  it("asks only when there is no choice or one under an older notice", () => {
    const answered = { analytics: false, marketing: false, at: "2026-11-21T10:00:00.000Z" };
    expect(consentNeedsAnswer(null)).toBe(true);
    expect(consentNeedsAnswer({ ...answered, pv: null })).toBe(true);
    expect(consentNeedsAnswer({ ...answered, pv: "2020-01" })).toBe(true);
    expect(consentNeedsAnswer({ ...answered, pv: POLICY_VERSION })).toBe(false);
  });
});
