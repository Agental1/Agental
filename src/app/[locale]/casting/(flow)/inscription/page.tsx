import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { mustVerifyEmail } from "@/lib/email-gate";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { signupAction } from "@/app/actions/auth";
import { CastingOnboardingWizard } from "@/components/onboarding/casting-onboarding-wizard";
import { parseJson } from "@/domain/json";
import { isCastingOnboarded } from "@/domain/auth-routes";
import { z } from "zod";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const tm = await getTranslations({ locale: toLocale(rawLocale), namespace: "casting" });
  return { title: tm("signup.metaTitle") };
}

const ScopeShape = z.object({
  projectTypes: z.array(z.string()).default([]),
  zones: z.array(z.string()).default([]),
});

export default async function CastingSignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "casting" });
  const session = await auth();

  if (!session?.user?.id || session.user.kind !== "CASTING") {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="font-display text-2xl font-medium">
            {t("signup.title")}
          </h1>
          <p className="text-sm text-fg-muted">{t("signup.subtitle")}</p>
        </div>
        <OAuthButtons
          className="mb-4"
          mode="signup"
          kind="CASTING"
          locale={locale}
          namespace="casting"
          tone="dark"
        />
        <AuthForm
          action={signupAction}
          submitLabel={t("signup.submit")}
          kind="CASTING"
          locale={locale}
        />
        <p className="mt-6 text-center text-sm text-fg-muted">
          {t("signup.already")}{" "}
          <Link href="/connexion" className="inline-flex min-h-11 items-center md:min-h-0 text-accent hover:underline">
            {t("signup.signIn")}
          </Link>
        </p>
      </div>
    );
  }
  // Round 11: the code first when Admin > Controls requires it (off by default).
  if (await mustVerifyEmail(session.user.id)) return redirect({ href: "/verifier", locale });

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    include: { organization: true },
  });

  // Already onboarded (org exists + email verified) → app. Same rule as
  // postAuthHome, which routes every sign-in.
  if (
    isCastingOnboarded({
      hasOwnerMembership: !!membership,
      onboardingCompletedAt: membership ? await onboardedAt(session.user.id) : null,
    })
  ) {
    return redirect({ href: "/casting/app", locale });
  }

  const scope = membership
    ? parseJson(ScopeShape, membership.organization.scope)
    : { projectTypes: [], zones: [] };

  return (
    <CastingOnboardingWizard
      initial={{
        organizationName: membership?.organization.name ?? "",
        siret: membership?.organization.siret ?? "",
        projectTypes: scope.projectTypes,
        zones: scope.zones,
      }}
    />
  );
}

async function onboardedAt(userId: string): Promise<Date | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompletedAt: true },
  });
  return u?.onboardingCompletedAt ?? null;
}
