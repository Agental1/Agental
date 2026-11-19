import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ProfileEditor } from "@/components/app/profile-editor";
import { parseJson, PhysicalTraits } from "@/domain/json";
import { scoreProfile } from "@/domain/completeness";
import { parseProfileTab } from "@/domain/profile-tabs";
import { isoDate } from "@/domain/age";
import { z } from "zod";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.profile.title") };
}

const PrefsShape = z.object({
  autoApply: z.boolean().default(false),
  dailyCap: z.number().optional(),
  nudity: z.boolean().default(false),
  animals: z.boolean().default(false),
});

export default async function ProfilPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  // ?tab= comes from the dashboard's deep links, and from anyone's URL bar.
  const initialTab = parseProfileTab((await searchParams).tab);
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
  });
  const prefs = parseJson(PrefsShape, profile.preferences);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.profile.title")}</h1>
        <p className="text-fg-muted">{t("space.profile.subtitle")}</p>
      </div>
      <ProfileEditor
        initial={{
          stageName: profile.stageName,
          legalName: profile.legalName ?? "",
          phone: profile.phone ?? "",
          city: profile.city ?? "",
          bio: profile.bio ?? "",
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
          })),
          preferences: prefs,
        }}
        initialTab={initialTab}
      />
    </div>
  );
}
