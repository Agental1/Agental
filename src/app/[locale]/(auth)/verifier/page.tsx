import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/auth";
import { VerifyEmailButton } from "@/components/auth/email-flows";
import { EmailCodeScreen } from "@/components/auth/email-code";
import { prisma } from "@/lib/db";
import { onboardingHome } from "@/domain/auth-routes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "common.emailFlow" });
  return { title: t("verifyTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/**
 * Two states on one address:
 * - with `?token=`, the landing of a confirmation link sent before round 10:
 *   a button confirms;
 * - without, round 10's code screen for a signed-in password account that has
 *   not verified its email: "Enter the 6-digit code we sent to ...". Once the
 *   code is right, the person continues to onboarding (or the app).
 */
export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const raw = (await searchParams).token;
  if (typeof raw === "string" && raw.length > 0) return <VerifyEmailButton token={raw} />;

  const session = await auth();
  if (!session?.user?.id || !session.user.email) return redirect({ href: "/connexion", locale });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true, passwordHash: true, kind: true, onboardingCompletedAt: true },
  });
  const next = user && !user.onboardingCompletedAt ? onboardingHome(user.kind, locale) : `/${locale}/continuer`;
  // Google accounts and verified ones have nothing to do here.
  if (!user || user.emailVerified || !user.passwordHash) return redirect({ href: next.replace(/^\/[a-z]{2}/, ""), locale });
  return <EmailCodeScreen email={session.user.email} next={next.replace(/^\/[a-z]{2}/, "")} />;
}
