/**
 * Round 11, group 3 (founder): the versions of the documents people accept.
 *
 * Each account records the version it accepted with the date
 * (`privacyAcceptedAt` / `privacyVersion`, `termsAcceptedAt` / `termsVersion`).
 * Signed-in people are never asked again: the version only records what a person
 * accepted when they signed up (the one box, or the Google sentence).
 * The Privacy Policy's "Last updated" date (messages, `privacy.updated`)
 * matches PRIVACY_POLICY_VERSION.
 */
export const PRIVACY_POLICY_VERSION = "2026-11-24";

/** The Terms of Service draft (docs/legal/TERMS_DRAFT.md), published only with TERMS_PAGE_ENABLED. */
export const TERMS_VERSION = "2026-11-draft";

/** The columns written when a person ticks the box (sign-up). */
export function acceptanceColumns(termsPublished: boolean, now: Date = new Date()) {
  return {
    privacyAcceptedAt: now,
    privacyVersion: PRIVACY_POLICY_VERSION,
    ...(termsPublished ? { termsAcceptedAt: now, termsVersion: TERMS_VERSION } : {}),
  };
}
