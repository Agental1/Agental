import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { signupAction } from "@/app/actions/auth";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { parseJson, parseStringArray, PhysicalTraits } from "@/domain/json";

export const metadata: Metadata = { title: "Devenir membre" };

export default async function TalentsSignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const session = await auth();

  // Not signed in → create account.
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="font-display text-2xl font-medium">
            Crée ton compte artiste
          </h1>
          <p className="text-sm text-fg-muted">
            Gratuit. On te représente, l&apos;IA travaille pour toi.
          </p>
        </div>
        <AuthForm
          action={signupAction}
          submitLabel="Créer mon compte"
          kind="TALENT"
          locale={locale}
        />
        <p className="mt-6 text-center text-sm text-fg-muted">
          Déjà membre ?{" "}
          <Link href="/connexion" className="text-accent hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    );
  }

  // Signed in → load or create profile, resume onboarding.
  const profile = await prisma.artistProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, stageName: "" },
    update: {},
    include: { specialties: true, mandat: true },
  });

  if (profile.mandat?.status === "ACTIVE" && profile.mandat.signedAt) {
    return redirect({ href: "/talents/app", locale });
  }

  const physical = parseJson(PhysicalTraits, profile.physical);

  return (
    <OnboardingWizard
      initial={{
        stageName: profile.stageName,
        legalName: profile.legalName ?? "",
        phone: profile.phone ?? "",
        city: profile.city ?? "",
        birthDate: profile.birthDate
          ? profile.birthDate.toISOString().slice(0, 10)
          : "",
        physical,
        specialties: profile.specialties.map((s) => s.kind),
        mobilityCountries: parseStringArray(profile.mobilityCountries),
        minRateEuros: profile.minRateCents
          ? profile.minRateCents / 100
          : undefined,
      }}
    />
  );
}
