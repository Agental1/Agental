import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ProfileEditor } from "@/components/app/profile-editor";
import { AvatarEditor } from "@/components/app/avatar-editor";
import { avatarSrc, initialsOf } from "@/domain/avatar";
import { completenessInputOf, legalNameParts, missingItems, scoreProfile } from "@/domain/completeness";
import { ITEM_TARGET, parseProfileFocus, parseProfileTab } from "@/domain/profile-tabs";
import { relinkNeeds } from "@/domain/relink";
import { MapPin, Phone } from "lucide-react";
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
  // Round 8c: a city or number round 8 could not link asks to be picked again.
  const relink = relinkNeeds(profile);
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
      {(relink.city || relink.phone) && (
        <ul className="space-y-2" aria-label={t("space.profile.relink.label")}>
          {relink.city && (
            <li className="flex flex-wrap items-center gap-3 rounded-sedan border border-warning/50 bg-surface px-4 py-3 text-[15px]">
              <MapPin aria-hidden="true" className="size-5 shrink-0 text-accent" />
              <p className="min-w-0 flex-1">{t("space.profile.relink.city", { city: profile.city ?? "" })}</p>
              {/* A full load: the editor reads ?tab and ?focus when it mounts. */}
              <a href={`/${locale}/talents/app/profil?tab=${ITEM_TARGET.city.tab}&focus=${ITEM_TARGET.city.focus}`} className="font-bold text-accent hover:underline">
                {t("space.profile.relink.cityAction")}
              </a>
            </li>
          )}
          {relink.phone && (
            <li className="flex flex-wrap items-center gap-3 rounded-sedan border border-warning/50 bg-surface px-4 py-3 text-[15px]">
              <Phone aria-hidden="true" className="size-5 shrink-0 text-accent" />
              <p className="min-w-0 flex-1">{t("space.profile.relink.phone")}</p>
              <a href={`/${locale}/talents/app/profil?tab=${ITEM_TARGET.phone.tab}&focus=${ITEM_TARGET.phone.focus}`} className="font-bold text-accent hover:underline">
                {t("space.profile.relink.phoneAction")}
              </a>
            </li>
          )}
        </ul>
      )}
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
