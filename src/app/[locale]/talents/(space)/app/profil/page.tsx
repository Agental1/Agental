import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ProfileEditor } from "@/components/app/profile-editor";
import { AvatarEditor } from "@/components/app/avatar-editor";
import { avatarSrc, initialsOf } from "@/domain/avatar";
import { completenessInputOf, legalNameParts, missingItems, scoreProfile } from "@/domain/completeness";
import { parseProfileFocus, parseProfileTab } from "@/domain/profile-tabs";
import { isoDate } from "@/domain/age";
import { readContentBoundaries } from "@/domain/preferences";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.profile.title") };
}

export default async function ProfilPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[]; focus?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  // ?tab= comes from the dashboard's deep links, and from anyone's URL bar.
  const query = await searchParams;
  const initialTab = parseProfileTab(query.tab);
  const initialFocus = parseProfileFocus(query.focus);
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      specialties: true,
      media: { orderBy: { order: "asc" } },
      user: { select: { emailVerified: true } },
    },
  });
  if (!profile) return null;

  // The single 100% rule (src/domain/completeness.ts): computed, never read
  // from completenessScore, which older rules may have left stale.
  const input = completenessInputOf(profile);
  const completeness = scoreProfile(input);
  const missing = missingItems(input);
  const contentBoundaries = readContentBoundaries(profile.preferences);
  // Google accounts are verified by Google; others by the verification email.
  const emailVerified = !!profile.user.emailVerified;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <AvatarEditor
          src={profile.avatarKey ? avatarSrc(session.user.id, profile.avatarUpdatedAt) : null}
          initials={initialsOf(profile.stageName, session.user.email)}
          size={72}
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-medium">{t("space.profile.title")}</h1>
          <p className="text-fg-muted">{t("space.profile.subtitle")}</p>
        </div>
      </div>
      <ProfileEditor
        initial={{
          stageName: profile.stageName,
          // The two-part legal name starts from the older single field until saved.
          legalFirstName: legalNameParts(input).first,
          legalLastName: legalNameParts(input).last,
          gender: profile.gender ?? "",
          genderOther: profile.genderOther ?? "",
          phone: profile.phone ?? "",
          phoneE164: profile.phoneE164 ?? "",
          city: profile.city ?? "",
          countryCode: profile.countryCode,
          admin1Code: profile.admin1Code,
          cityGeonameId: profile.cityGeonameId,
          bio: profile.bio ?? "",
          imdbUrl: profile.imdbUrl ?? "",
          portfolioUrl: profile.portfolioUrl ?? "",
          birthDate: profile.birthDate ? isoDate(profile.birthDate) : "",
          physical: input.physical,
          specialties: profile.specialties.map((s) => s.kind),
          dayRateUsd: profile.minRateCents ? Math.round(profile.minRateCents / 100) : undefined,
          completeness,
          missing,
          media: profile.media.map((m) => ({
            id: m.id,
            type: m.type,
            isPrimary: m.isPrimary,
            mime: m.mime,
            category: m.category,
            description: m.description,
          })),
          preferences: input.preferences,
          contentBoundaries,
        }}
        initialTab={initialTab}
        initialFocus={initialFocus}
        emailVerified={emailVerified}
        hasAvatar={!!profile.avatarKey}
        celebrated={!!profile.profileCompletedAt}
        roleAlert={{
          initial:
            profile.roleAlertChannel === "sms" || profile.roleAlertChannel === "both"
              ? profile.roleAlertChannel
              : "email",
          hasPhone: !!profile.phoneE164,
          consentGiven: !!profile.smsConsentAt,
        }}
      />
    </div>
  );
}
