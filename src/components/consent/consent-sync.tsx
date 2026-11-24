"use client";

import { useEffect } from "react";
import { saveConsent } from "@/app/actions/consent";
import { browserConsentAfterSignIn, clearConsent, readConsent, readConsentRecord, writeConsent, type Consent } from "./consent-cookie";

/** Round 11: browser choices made from this day on are fresh answers, kept and saved on the account. */
const ASK_AGAIN_FROM = Date.parse("2026-11-24T00:00:00Z");

/**
 * The cookie choice is saved on the account. On every signed-in page the
 * browser is brought in line with it, the stricter choice winning per
 * category (see browserConsentAfterSignIn): a browser with no choice gets the
 * account's, a refusal saved on the account reaches this browser, and a
 * refusal made in this browser (for example by another account signed in
 * here earlier) is never undone silently.
 */
export function ConsentSync({
  consent,
  at = null,
  pv = null,
}: {
  consent: Consent | null;
  /** When the account's choice was made, and under which notice version. */
  at?: string | null;
  pv?: string | null;
}) {
  useEffect(() => {
    // Round 11: an account with no choice recorded (older accounts) is asked
    // again: the banner comes back and its answer is saved on the account.
    if (!consent) {
      const record = readConsentRecord();
      if (!record) return;
      // A choice made in this browser since round 11 (for example just before a
      // Google sign-up, or a save that failed) is kept and saved on the account.
      if (record.at && Date.parse(record.at) >= ASK_AGAIN_FROM) {
        void saveConsent({ analytics: record.analytics, marketing: record.marketing }).catch(() => undefined);
        return;
      }
      clearConsent();
      return;
    }
    const next = browserConsentAfterSignIn(readConsent(), consent);
    if (!next) return;
    // The account's own date and version travel with its answers; a stricter
    // mix of the two is a new choice, dated now.
    const brought = consent && next.analytics === consent.analytics && next.marketing === consent.marketing;
    writeConsent(next, brought ? { at, pv } : undefined);
  }, [consent, at, pv]);
  return null;
}
