import { toLocale } from "@/i18n/routing";
import type { SetupStep } from "./setup";

/**
 * Where a user lands once authenticated.
 *
 * These strings are handed to NextAuth as `redirectTo`, and NextAuth redirects
 * to them verbatim — it knows nothing about next-intl. Without a locale prefix
 * the target is not a routed URL: the client router fetched the RSC payload for
 * `/talents/app`, the proxy answered 307 to `/fr/talents/app`, the router did
 * not follow it, and the user stayed on the sign-in form holding a valid
 * session. Silent, and indistinguishable from a wrong password.
 *
 * They live here rather than in the server action because a `"use server"`
 * module may only export async functions, which makes anything in it
 * untestable. This is the kind of defect that returns unnoticed, so it gets
 * tests.
 */

/** Dashboard for a signed-in user, by portal. */
export function appHome(kind: string, locale: string): string {
  const l = toLocale(locale);
  return kind === "CASTING" ? `/${l}/casting/app` : `/${l}/talents/app`;
}

/** Onboarding wizard for a freshly created account, by portal. */
export function onboardingHome(kind: string, locale: string): string {
  const l = toLocale(locale);
  return kind === "CASTING"
    ? `/${l}/casting/inscription`
    : `/${l}/talents/inscription`;
}

/**
 * The first screen after onboarding, shown once: profile completeness for a
 * talent, the dashboard for a casting user, both with ?welcome=1 so the page
 * can show the "How this works" tutorial. Later sign-ins go to appHome.
 */
export function firstRunHome(kind: string, locale: string): string {
  const l = toLocale(locale);
  return kind === "CASTING"
    ? `/${l}/casting/app?welcome=1`
    : `/${l}/talents/app?welcome=1`;
}

/** What postAuthHome needs to know about the account. Loaded by /continuer. */
export interface PostAuthState {
  /**
   * Talent: the first unfinished setup step (see ./setup.ts), null once the
   * basics are saved. Left out, the account is treated as still in setup.
   */
  setupStep?: SetupStep | null;
  /**
   * The talent's representation mandate, if any. Routing no longer reads it:
   * the mandate is out of the beta. Kept for isMandateSigned.
   */
  mandat?: { status: string; signedAt: Date | null } | null;
  /** Casting: an OWNER membership exists. */
  hasOwnerMembership?: boolean;
  /**
   * User.onboardingCompletedAt: stamped when the first-run screen has been
   * served. For a casting user it is also what "onboarding finished" means.
   */
  onboardingCompletedAt?: Date | null;
}

/**
 * True for an account that signed the representation mandate before the beta.
 * No route depends on it any more.
 */
export function isMandateSigned(state: PostAuthState): boolean {
  return state.mandat?.status === "ACTIVE" && !!state.mandat.signedAt;
}

/** A talent's basics are saved: stage name, adult date of birth, a specialty. */
export function isTalentSetUp(state: PostAuthState): boolean {
  return state.setupStep === null;
}

/**
 * Casting onboarding is done once the organisation exists and the last step
 * of the wizard has run, which stamps onboardingCompletedAt. (It used to read
 * User.emailVerified, which a provider sign-in sets at account creation, so a
 * Google or Apple casting user counted as onboarded half way through.)
 */
export function isCastingOnboarded(state: PostAuthState): boolean {
  return !!state.hasOwnerMembership && !!state.onboardingCompletedAt;
}

/**
 * Where any sign-in lands, email or provider. /<locale>/continuer calls this
 * so both methods share one routing rule.
 *
 * Casting: the dashboard when onboarding is complete, the wizard otherwise.
 *
 * Talent: always the app. While a setup step is missing, the dashboard, whose
 * "Complete my profile" card names that step and resumes it, on this sign-in
 * and on every later one. The first time the basics are all saved, the profile
 * with the tutorial, once. After that, the dashboard. Signing a mandate is no
 * longer part of it.
 */
export function postAuthHome(
  kind: string | undefined,
  locale: string,
  state: PostAuthState
): string {
  if (kind === "CASTING") {
    return isCastingOnboarded(state) ? appHome(kind, locale) : onboardingHome(kind, locale);
  }
  // The caller stamps onboardingCompletedAt (see needsFirstRun).
  return needsFirstRun("TALENT", state) ? firstRunHome("TALENT", locale) : appHome("TALENT", locale);
}

/**
 * True when postAuthHome answers with the first-run screen, so the caller
 * knows to stamp User.onboardingCompletedAt. completeBetaOnboarding normally
 * stamps it at the end of the wizard; this covers accounts that saved their
 * basics another way.
 */
export function needsFirstRun(kind: string | undefined, state: PostAuthState): boolean {
  if (kind === "CASTING") return false; // the stamp is part of "onboarded" there
  return isTalentSetUp(state) && !state.onboardingCompletedAt;
}
