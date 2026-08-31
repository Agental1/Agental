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
