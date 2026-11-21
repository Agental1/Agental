"use client";

import { useEffect } from "react";
import { browserConsentAfterSignIn, readConsent, writeConsent, type Consent } from "./consent-cookie";

/**
 * The cookie choice is saved on the account. On every signed-in page the
 * browser is brought in line with it, the stricter choice winning per
 * category (see browserConsentAfterSignIn): a browser with no choice gets the
 * account's, a refusal saved on the account reaches this browser, and a
 * refusal made in this browser (for example by another account signed in
 * here earlier) is never undone silently.
 */
export function ConsentSync({ consent }: { consent: Consent | null }) {
  useEffect(() => {
    const next = browserConsentAfterSignIn(readConsent(), consent);
    if (next) writeConsent(next);
  }, [consent]);
  return null;
}
