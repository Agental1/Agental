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

/**
 * Round 12.1, group 2: three acceptances that are never merged (docs/LEGAL_COPY.md).
 * The Privacy Policy box (`acceptanceColumns`), the representation step, and the
 * optional plans step each write their own date and version.
 */

/** The wording of the representation step (the beta agreement summary and its "signing is closed" notice). */
export const REPRESENTATION_STEP_VERSION = "2026-11-26";

/** The wording of the optional plans step. */
export const PLANS_STEP_VERSION = "2026-11-26";

/**
 * The columns written when a person sees and acknowledges the representation
 * step. This is NOT a signature: it never touches Mandat (signedAt stays null).
 */
export function representationAckColumns(now: Date = new Date()) {
  return { representationAckAt: now, representationAckVersion: REPRESENTATION_STEP_VERSION };
}

/** The columns written when a person goes through the plans step, with the plan picked there. */
export function plansStepColumns(choice: string, now: Date = new Date()) {
  return { plansStepAt: now, plansStepVersion: PLANS_STEP_VERSION, plansStepChoice: choice };
}
