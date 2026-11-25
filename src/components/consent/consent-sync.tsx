"use client";

import { useEffect } from "react";
import { saveConsent } from "@/app/actions/consent";
import { browserConsentAfterSignIn, consentNeedsAnswer, readConsent, readConsentRecord, writeConsent, type Consent } from "./consent-cookie";

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
    // An account with no choice recorded (older accounts): a choice already made in
    // this browser is saved on the account; with none, the small banner asks once
    // and its answer is saved on the account.
    if (!consent) {
      const record = readConsentRecord();
      if (record && !consentNeedsAnswer(record)) {
        void saveConsent({ analytics: record.analytics, marketing: record.marketing }).catch(() => undefined);
      }
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
