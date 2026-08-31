"use server";

import { err, zodError, type ActionError } from "@/domain/action-result";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { SignupInput } from "@/domain/auth";
import { audit } from "@/lib/audit";
import { appHome, onboardingHome } from "@/domain/auth-routes";

export type AuthState = { error?: ActionError } | undefined;

export async function signupAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = SignupInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    kind: formData.get("kind"),
    locale: formData.get("locale") || "fr",
  });
  if (!parsed.success) {
    return { error: zodError(parsed.error) ?? "Données invalides." };
  }
  const { email, password, kind, locale } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: err("errors.emailTaken") };

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, kind, locale },
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
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const locale = String(formData.get("locale") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  const redirectTo = appHome(user?.kind ?? "TALENT", locale);

  try {
    await signIn("credentials", { email, password, redirectTo });
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
