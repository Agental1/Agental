import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ProfileEditor } from "@/components/app/profile-editor";
import { AvatarEditor } from "@/components/app/avatar-editor";
import { avatarSrc, initialsOf } from "@/domain/avatar";
import { parseJson, PhysicalTraits } from "@/domain/json";
import { scoreProfile } from "@/domain/completeness";
import { parseProfileFocus, parseProfileTab } from "@/domain/profile-tabs";
import { isoDate } from "@/domain/age";
import { readContentBoundaries, readPreferences } from "@/domain/preferences";

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
      availability: { orderBy: { from: "asc" } },
    },
  });
  if (!profile) return null;

  const physical = parseJson(PhysicalTraits, profile.physical);
  // Computed, not read from completenessScore: rows scored before the
  // empty-physical fix still hold an inflated number.
  const completeness = scoreProfile({
    stageName: profile.stageName,
    birthDate: profile.birthDate,
    city: profile.city,
    bio: profile.bio,
    physical,
    specialtiesCount: profile.specialties.length,
    media: profile.media,
    imdbUrl: profile.imdbUrl,
    portfolioUrl: profile.portfolioUrl,
  });
  // Job preferences and the private content boundaries share one column but
  // are read, and saved, apart. Unset answers come back unset.
  const preferences = readPreferences(profile.preferences);
  const contentBoundaries = readContentBoundaries(profile.preferences);

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
          legalName: profile.legalName ?? "",
          // The two-part legal name starts from the older single field, split
          // at the first space, until the performer saves it.
          legalFirstName:
            profile.legalFirstName ?? (profile.legalName ?? "").trim().split(/\s+/)[0] ?? "",
          legalLastName:
            profile.legalLastName ??
            (profile.legalName ?? "").trim().split(/\s+/).slice(1).join(" "),
          gender: profile.gender ?? "",
          genderOther: profile.genderOther ?? "",
          phone: profile.phone ?? "",
          city: profile.city ?? "",
          bio: profile.bio ?? "",
          imdbUrl: profile.imdbUrl ?? "",
          portfolioUrl: profile.portfolioUrl ?? "",
          birthDate: profile.birthDate ? isoDate(profile.birthDate) : "",
          physical,
          specialties: profile.specialties.map((s) => s.kind),
          minRateEuros: profile.minRateCents
            ? profile.minRateCents / 100
            : undefined,
          completeness,
          media: profile.media.map((m) => ({
            id: m.id,
            type: m.type,
            isPrimary: m.isPrimary,
            mime: m.mime,
            category: m.category,
            description: m.description,
          })),
          preferences,
          contentBoundaries,
          availability: profile.availability.map((a) => ({
            id: a.id,
            from: isoDate(a.from),
            to: isoDate(a.to),
            type: a.type === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
          })),
        }}
        initialTab={initialTab}
        initialFocus={initialFocus}
      />
    </div>
  );
}
