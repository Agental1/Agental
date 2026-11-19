import { toLocale } from "@/i18n/routing";

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

/** What postAuthHome needs to know about the account. Loaded by /continuer. */
export interface PostAuthState {
  /** The talent's mandate, if any. */
  mandat?: { status: string; signedAt: Date | null } | null;
  /** Casting: an OWNER membership exists. */
  hasOwnerMembership?: boolean;
  /** Casting: User.emailVerified is set. */
  emailVerified?: boolean;
}

/** Talent onboarding is done once the mandate is signed and active. */
export function isMandateSigned(state: PostAuthState): boolean {
  return state.mandat?.status === "ACTIVE" && !!state.mandat.signedAt;
}

/**
 * Casting onboarding is done once the organisation exists and the email is
 * verified: the rule the casting inscription page applies.
 */
export function isCastingOnboarded(state: PostAuthState): boolean {
  return !!state.hasOwnerMembership && !!state.emailVerified;
}

/**
 * Where any sign-in lands, email or provider: the dashboard when onboarding is
 * complete, the onboarding wizard otherwise. /<locale>/continuer calls this so
 * both methods share one routing rule.
 */
export function postAuthHome(
  kind: string | undefined,
  locale: string,
  state: PostAuthState
): string {
  const k = kind === "CASTING" ? "CASTING" : "TALENT";
  const done = k === "CASTING" ? isCastingOnboarded(state) : isMandateSigned(state);
  return done ? appHome(k, locale) : onboardingHome(k, locale);
}
