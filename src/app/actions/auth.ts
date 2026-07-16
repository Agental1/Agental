"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { SignupInput } from "@/domain/auth";
import { audit } from "@/lib/audit";

export type AuthState = { error?: string } | undefined;

function appHome(kind: string) {
  return kind === "CASTING" ? "/casting/app" : "/talents/app";
}
function onboardingHome(kind: string) {
  return kind === "CASTING" ? "/casting/inscription" : "/talents/inscription";
}

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
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const { email, password, kind, locale } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Un compte existe déjà avec cet email." };

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
      redirectTo: onboardingHome(kind),
    });
  } catch (error) {
    // On success signIn throws a redirect (not an AuthError) — rethrow it.
    if (error instanceof AuthError) {
      return { error: "Compte créé, mais connexion impossible. Réessaie." };
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

  const user = await prisma.user.findUnique({ where: { email } });
  const redirectTo = user ? appHome(user.kind) : "/talents/app";

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email ou mot de passe incorrect." };
    }
    throw error; // redirect on success
  }
  return undefined;
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
