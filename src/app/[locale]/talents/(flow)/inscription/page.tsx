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
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { legalNameParts } from "@/domain/completeness";
import { prefillFromProvider } from "@/lib/profile-prefill";
import { isoDate } from "@/domain/age";
import { getSetupState } from "@/lib/setup";
import { SETUP_STEPS } from "@/domain/setup";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const tm = await getTranslations({ locale: toLocale(rawLocale), namespace: "talents" });
  return { title: tm("signup.metaTitle") };
}

export default async function TalentsSignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  const session = await auth();

  // Not signed in → create account.
  if (!session?.user?.id || session.user.kind !== "TALENT") {
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
          kind="TALENT"
          locale={locale}
          namespace="talents"
        />
        <AuthForm
          action={signupAction}
          submitLabel={t("signup.submit")}
          kind="TALENT"
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

  // Signed in: once the basics are saved and the last screen was passed, the
  // wizard has nothing left to ask. Round 10: the answers save straight into
  // the profile, so the basics can be complete while the third screen (the
  // agreement, which stamps the first run) is still ahead.
  const { nextStep, onboardingCompletedAt } = await getSetupState(session.user.id);
  if (nextStep === null && onboardingCompletedAt) {
    return redirect({ href: "/talents/app", locale });
  }

  // Otherwise load or create the profile and resume at the first unfinished step.
  // Round 10: the questions are the profile's own fields (Google may have
  // prefilled the names).
  await prisma.artistProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, stageName: "" },
    update: {},
  });
  // Google sign-ups: the names Google gave, only where still empty.
  await prefillFromProvider(session.user.id).catch(() => null);
  const profile = await prisma.artistProfile.findUniqueOrThrow({ where: { userId: session.user.id } });
  const names = legalNameParts(profile);

  return (
    <OnboardingWizard
      initialStep={nextStep === null ? SETUP_STEPS.length : SETUP_STEPS.indexOf(nextStep)}
      initial={{
        legalFirstName: names.first,
        legalLastName: names.last,
        stageName: profile.stageName,
        birthDate: profile.birthDate ? isoDate(profile.birthDate) : "",
        gender: profile.gender ?? "",
        genderOther: profile.genderOther ?? "",
        phone: profile.phone ?? "",
        phoneE164: profile.phoneE164 ?? "",
      }}
    />
  );
}
