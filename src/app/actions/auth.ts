"use server";

import { err, zodError, type ActionError } from "@/domain/action-result";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { LoginInput, SignupInput } from "@/domain/auth";
import { consentColumns } from "@/domain/consent";
import { readConsentCookie } from "@/lib/consent";
import { audit } from "@/lib/audit";
import { findUsersByEmail } from "@/lib/auth/user-by-email";
import { onboardingHome } from "@/domain/auth-routes";
import { toLocale } from "@/i18n/routing";

export type AuthState = { error?: ActionError } | undefined;

export async function signupAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = SignupInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    kind: formData.get("kind"),
    locale: formData.get("locale") || "en",
  });
  if (!parsed.success) {
    return { error: zodError(parsed.error) };
  }
  const { email, password, kind, locale } = parsed.data;

  // In any letter case: a row stored as "Ana@X.com" before emails were
  // normalized already holds "ana@x.com".
  const existing = await findUsersByEmail(prisma, email);
  if (existing.length > 0) return { error: err("errors.emailTaken") };

  const passwordHash = await bcrypt.hash(password, 10);
  // The cookie choice made at the consent step, if any, becomes the record.
  const consent = await readConsentCookie();
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      kind,
      locale,
      ...(consent ? consentColumns(consent) : {}),
    },
  });
  await audit({
    actorUserId: user.id,
    action: "user.signup",
    resourceType: "User",
    resourceId: user.id,
    after: { kind },
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: onboardingHome(kind, locale),
    });
  } catch (error) {
    // On success signIn throws a redirect (not an AuthError) — rethrow it.
    if (error instanceof AuthError) {
      return { error: err("errors.signInAfterSignup") };
    }
    throw error;
  }
  return undefined;
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = LoginInput.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: err("errors.badCredentials") };
  const { email, password } = parsed.data;
  const locale = toLocale(String(formData.get("locale") ?? ""));

  // /continuer picks the portal and the step once the session exists, the
  // same way it does for Google and Apple. No pre-auth lookup here: choosing a
  // destination before the password is checked told nothing to the user and
  // cost a query on every failed attempt.
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: `/${locale}/continuer`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: err("errors.badCredentials") };
    }
    throw error; // redirect on success
  }
  return undefined;
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
