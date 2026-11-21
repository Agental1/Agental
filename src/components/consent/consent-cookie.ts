/**
 * The visitor's cookie choice, kept in a first-party cookie so it exists
 * before any account does. Sign-up copies it onto the new user (server side,
 * `saveConsent`), and Settings can change it later.
 *
 * Shape agreed with the backend session: {"v":1,"analytics":bool,"marketing":bool}.
 * Strictly necessary cookies are not in it: they are always on.
 */
export const CONSENT_COOKIE = "agental.consent";
export const CONSENT_EVENT = "agental:consent";

export interface Consent {
  analytics: boolean;
  marketing: boolean;
}

export const NECESSARY_ONLY: Consent = { analytics: false, marketing: false };

/** The stored choice, or null when the visitor has not chosen yet. */
export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  if (!entry) return null;
  try {
    const value = JSON.parse(decodeURIComponent(entry.slice(CONSENT_COOKIE.length + 1)));
    if (value?.v !== 1) return null;
    return { analytics: value.analytics === true, marketing: value.marketing === true };
  } catch {
    return null;
  }
}

/** Six months, then the question comes back. */
export function writeConsent(consent: Consent): void {
  const value = encodeURIComponent(JSON.stringify({ v: 1, ...consent }));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** True when two choices answer every category the same way. */
export function sameConsent(a: Consent | null, b: Consent | null): boolean {
  if (!a || !b) return a === b;
  return a.analytics === b.analytics && a.marketing === b.marketing;
}

/**
 * What a signed-in page writes to this browser, or null to leave it alone.
 * The stricter choice wins, category by category: a refusal saved on the
 * account is applied here, and a refusal made in this browser is never
 * turned back into an acceptance without the person choosing again.
 * A browser with no choice yet gets the account's choice.
 */
export function browserConsentAfterSignIn(
  browser: Consent | null,
  account: Consent | null
): Consent | null {
  if (!account) return null;
  if (!browser) return account;
  const stricter = {
    analytics: browser.analytics && account.analytics,
    marketing: browser.marketing && account.marketing,
  };
  return sameConsent(stricter, browser) ? null : stricter;
}

/**
 * The choice this browser applies once ConsentSync has run: what Settings
 * shows, so its toggles match what actually happens on this device.
 */
export function effectiveConsent(browser: Consent | null, account: Consent | null): Consent | null {
  return browserConsentAfterSignIn(browser, account) ?? browser ?? account;
}
