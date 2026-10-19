/**
 * Where a user lands once authenticated.
 *
 * These strings are handed to NextAuth as `redirectTo`, and NextAuth redirects
 * to them verbatim — it knows nothing about next-intl. The site is English
 * only with `localePrefix: "never"`, so the routed URL is the unprefixed one:
 * the proxy rewrites `/talents/app` onto the internal `[locale]` segment.
 *
 * They take no locale: there is one, and it never appears in the URL.
 * They live here rather than in the server action
 * because a `"use server"` module may only export async functions, which makes
 * anything in it untestable.
 */

/** Dashboard for a signed-in user, by portal. */
export function appHome(kind: string): string {
  return kind === "CASTING" ? "/casting/app" : "/talents/app";
}

/** Onboarding wizard for a freshly created account, by portal. */
export function onboardingHome(kind: string): string {
  return kind === "CASTING" ? "/casting/inscription" : "/talents/inscription";
}
