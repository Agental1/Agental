import { z } from "zod";

/**
 * Cookie consent.
 *
 * The site sets strictly necessary cookies only (session, CSRF, sign-in state,
 * language) and they need no consent. Two optional categories exist:
 * "analytics" and "marketing". Both are off until the person chooses.
 *
 * Before an account exists the choice lives in a first-party cookie the
 * consent banner writes. Signing up copies it onto the new user row, and from
 * then on the row is the record: saveConsent() updates it and rewrites the
 * cookie so the page and the server agree.
 */

export const CONSENT_COOKIE = "agental.consent";
/** Six months, then the banner asks again. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 182;
export const CONSENT_VERSION = 1;
/**
 * The version of the cookie notice a choice was made under, stored with the
 * choice and its date (the cookie's `pv` and `at`, the account's
 * `consentVersion` and `consentAt`). Bump it when the cookie categories or the
 * Privacy Policy's cookie section change: everyone is asked again, once.
 */
export const CONSENT_POLICY_VERSION = "2026-11";

export const ConsentChoice = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
});
export type ConsentChoice = z.infer<typeof ConsentChoice>;

const CookieShape = ConsentChoice.extend({
  v: z.literal(CONSENT_VERSION),
  at: z.string().max(40).optional(),
  pv: z.string().max(20).optional(),
});

/** The value the banner writes: {"v":1,"analytics":false,"marketing":false}. */
export function serializeConsent(choice: ConsentChoice, now: Date = new Date()): string {
  return JSON.stringify({
    v: CONSENT_VERSION,
    analytics: choice.analytics,
    marketing: choice.marketing,
    at: now.toISOString(),
    pv: CONSENT_POLICY_VERSION,
  });
}

/**
 * Read a consent cookie. Anything unexpected (absent, malformed, another
 * version, extra types) means no choice was recorded, which is the safe
 * reading: nothing optional loads.
 */
export function parseConsentCookie(raw: string | null | undefined): ConsentChoice | null {
  if (!raw || raw.length > 200) return null;
  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponentSafe(raw));
  } catch {
    return null;
  }
  const parsed = CookieShape.safeParse(value);
  return parsed.success
    ? { analytics: parsed.data.analytics, marketing: parsed.data.marketing }
    : null;
}

function decodeURIComponentSafe(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** User columns for a choice made at `now`. */
export function consentColumns(choice: ConsentChoice, now: Date = new Date()) {
  return {
    consentAnalytics: choice.analytics,
    consentMarketing: choice.marketing,
    consentAt: now,
    consentVersion: CONSENT_POLICY_VERSION,
  };
}
