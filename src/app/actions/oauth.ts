"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { enabledOAuthProviders, signIn } from "@/auth";
import { redirect } from "@/i18n/navigation";
import { toLocale, type Locale } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { UserKind } from "@/domain/enums";
import type { AuthErrorCode } from "@/domain/auth-errors";
import { OAUTH_PROVIDER_IDS, type OAuthProviderId } from "@/lib/auth/oauth-providers";
import { resolveOAuthUser } from "@/lib/auth/resolve-oauth-user";
import {
  clearPendingCookie,
  readPendingCookie,
  writeIntentCookie,
} from "@/lib/auth/oauth-cookies";

/**
 * Google and Apple sign-in. Both actions end in a redirect, to the provider on
 * success and to /connexion?error=<code> otherwise; errors travel as codes that
 * the page maps to message keys, never as sentences.
 */

const OAuthStart = z.object({
  provider: z.enum(OAUTH_PROVIDER_IDS),
  mode: z.enum(["signin", "signup"]),
  kind: UserKind.optional(),
});

function failTo(locale: Locale, code: AuthErrorCode): never {
  return redirect({
    href: { pathname: "/connexion", query: { error: code } },
    locale,
  });
}

/**
 * Leave for the provider. The callback comes back to /api/auth, where the
 * signIn callback in src/auth.ts reads the intent cookie set before calling
 * this, then lands on /<locale>/continuer.
 */
async function goToProvider(provider: OAuthProviderId, locale: Locale) {
  try {
    await signIn(provider, { redirectTo: `/${locale}/continuer` });
  } catch (error) {
    // Success throws Next's redirect, which must pass through.
    if (error instanceof AuthError) failTo(locale, "oauthGeneric");
    throw error;
  }
}

/** Form action behind each "Continue with Google / Apple" button. */
export async function oauthSignInAction(formData: FormData): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? ""));
  const parsed = OAuthStart.safeParse({
    provider: formData.get("provider"),
    mode: formData.get("mode") ?? "signin",
    kind: formData.get("kind") || undefined,
  });
  if (!parsed.success || !enabledOAuthProviders.includes(parsed.data.provider)) {
    failTo(locale, "oauthGeneric");
  }
  const { provider, mode, kind } = parsed.data;

  // A kind only means something on a signup page. From /connexion, a person
  // with no account yet is asked which portal they want instead of guessed.
  await writeIntentCookie({
    mode,
    kind: mode === "signup" ? kind : undefined,
    locale,
  });
  await goToProvider(provider, locale);
}

/**
 * The talent / casting director choice on /continuer, for a verified provider
 * identity that had no account and no kind. Creates the account from the
 * signed pending cookie, then runs the provider sign-in again: Auth.js has no
 * server-side way to open a session without a provider round trip. The
 * Account exists by then, and the provider remembers consent, so the second
 * trip is silent or one click.
 */
export async function completePendingOAuthAction(
  formData: FormData
): Promise<void> {
  const locale = toLocale(String(formData.get("locale") ?? ""));
  const kind = UserKind.safeParse(formData.get("kind"));

  const identity = await readPendingCookie();
  if (!identity) failTo(locale, "oauthNoAccount");
  if (!kind.success) {
    return redirect({
      href: { pathname: "/continuer", query: { choose: "1" } },
      locale,
    });
  }
  if (!enabledOAuthProviders.includes(identity.provider)) {
    await clearPendingCookie();
    failTo(locale, "oauthGeneric");
  }

  const result = await resolveOAuthUser(prisma, identity, {
    mode: "signup",
    kind: kind.data,
    locale,
  });
  await clearPendingCookie();
  if (result.type === "refused") failTo(locale, result.error);
  if (result.type === "pending") failTo(locale, "oauthGeneric");

  await writeIntentCookie({ mode: "signin", locale });
  await goToProvider(identity.provider, locale);
}
