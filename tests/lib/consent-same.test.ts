import { describe, expect, it } from "vitest";
import {
  browserConsentAfterSignIn,
  effectiveConsent,
  sameConsent,
} from "@/components/consent/consent-cookie";

const all = { analytics: true, marketing: true };
const none = { analytics: false, marketing: false };

describe("sameConsent", () => {
  it("matches equal choices", () => {
    expect(sameConsent(all, { analytics: true, marketing: true })).toBe(true);
  });
  it("sees a single category that differs", () => {
    expect(sameConsent(all, { analytics: true, marketing: false })).toBe(false);
  });
  it("treats a missing browser choice as different from the account's", () => {
    expect(sameConsent(null, none)).toBe(false);
  });
  it("treats two missing choices as the same", () => {
    expect(sameConsent(null, null)).toBe(true);
  });
});

// ConsentSync writes what this returns to the browser on every signed-in
// page. Null means "leave the browser's cookie as it is".
describe("browserConsentAfterSignIn (the stricter choice wins)", () => {
  it("puts the account's choice back in a browser that has none", () => {
    expect(browserConsentAfterSignIn(null, all)).toEqual(all);
  });
  it("leaves the browser alone when the account has no choice", () => {
    expect(browserConsentAfterSignIn(all, null)).toBeNull();
  });
  it("leaves the browser alone when both agree", () => {
    expect(browserConsentAfterSignIn(all, { ...all })).toBeNull();
  });
  it("applies a refusal saved on the account", () => {
    expect(browserConsentAfterSignIn(all, none)).toEqual(none);
  });
  it("keeps a refusal made in this browser even if the account accepted", () => {
    expect(browserConsentAfterSignIn(none, all)).toBeNull();
  });
  it("decides each category on its own", () => {
    expect(
      browserConsentAfterSignIn({ analytics: false, marketing: true }, { analytics: true, marketing: false })
    ).toEqual({ analytics: false, marketing: false });
  });
});

// What Settings shows: the choice this browser actually applies once
// ConsentSync has run, not the account's raw value.
describe("effectiveConsent", () => {
  it("shows a refusal kept in this browser even when the account accepted", () => {
    expect(effectiveConsent(none, all)).toEqual(none);
  });
  it("shows the account's refusal over a browser acceptance", () => {
    expect(effectiveConsent(all, none)).toEqual(none);
  });
  it("falls back to whichever side has a choice", () => {
    expect(effectiveConsent(null, all)).toEqual(all);
    expect(effectiveConsent(all, null)).toEqual(all);
    expect(effectiveConsent(null, null)).toBeNull();
  });
});
