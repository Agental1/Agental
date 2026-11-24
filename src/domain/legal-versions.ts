/**
 * Round 11, group 3 (founder): the versions of the documents people accept.
 *
 * Each account records the version it accepted with the date
 * (`privacyAcceptedAt` / `privacyVersion`, `termsAcceptedAt` / `termsVersion`).
 * Bump a version when the document changes in a way people must accept again:
 * every account then sees the acceptance prompt once, at its next sign-in.
 * The Privacy Policy's "Last updated" date (messages, `privacy.updated`)
 * matches PRIVACY_POLICY_VERSION.
 */
export const PRIVACY_POLICY_VERSION = "2026-11-24";

/** The Terms of Service draft (docs/legal/TERMS_DRAFT.md), published only with TERMS_PAGE_ENABLED. */
export const TERMS_VERSION = "2026-11-draft";

/** The anchor of the "Account security and abuse" section of the Privacy Policy. */
export const PRIVACY_SECURITY_ANCHOR = "security";

export interface LegalAcceptance {
  privacyAcceptedAt: Date | null;
  privacyVersion: string | null;
  termsAcceptedAt: Date | null;
  termsVersion: string | null;
}

/**
 * Must this account accept (again) before using the app? Yes when the current
 * Privacy Policy version was never accepted, or, once the Terms are published,
 * when the current Terms version was never accepted.
 */
export function needsLegalAcceptance(u: LegalAcceptance, termsPublished: boolean): boolean {
  if (!u.privacyAcceptedAt || u.privacyVersion !== PRIVACY_POLICY_VERSION) return true;
  if (termsPublished && (!u.termsAcceptedAt || u.termsVersion !== TERMS_VERSION)) return true;
  return false;
}

/** The columns written when a person ticks the box (sign-up or the prompt). */
export function acceptanceColumns(termsPublished: boolean, now: Date = new Date()) {
  return {
    privacyAcceptedAt: now,
    privacyVersion: PRIVACY_POLICY_VERSION,
    ...(termsPublished ? { termsAcceptedAt: now, termsVersion: TERMS_VERSION } : {}),
  };
}
