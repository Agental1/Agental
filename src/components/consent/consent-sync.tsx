"use client";

import { useEffect } from "react";
import { readConsent, writeConsent, type Consent } from "./consent-cookie";

/**
 * The cookie choice is saved on the account. On a device (or after cookies
 * were cleared) where this browser has no choice yet, put the account's
 * choice back, so the banner does not ask again after each sign-in.
 */
export function ConsentSync({ consent }: { consent: Consent | null }) {
  useEffect(() => {
    if (consent && !readConsent()) writeConsent(consent);
  }, [consent]);
  return null;
}
