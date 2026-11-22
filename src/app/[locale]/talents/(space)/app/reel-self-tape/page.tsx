import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clapperboard, Lock } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SelfTapeStudio } from "@/components/talents/self-tape-studio";
import { RecordingsLibrary, type LibraryItem } from "@/components/talents/recordings-library";
import { listRecordings } from "@/lib/recordings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.selftape.title") };
}

export default async function SelfTapePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) return null;

  // Both destinations, from the media list (the same rows the profile uses).
  const items: LibraryItem[] = (await listRecordings(profile.id)).map((r) => ({
    id: r.id,
    url: r.url,
    destination: r.destination === "profile" ? "profile" : "library",
    takeNumber: r.takeNumber,
    title: r.title,
    qualityScore: r.qualityScore,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.selftape.title")}</h1>
        <p className="text-fg-muted">{t("space.selftape.subtitle")}</p>
        {/* What a self-tape is for, and where it goes. */}
        <div className="mt-3 space-y-1.5 text-[15px]">
          <p className="flex items-start gap-2">
            <Clapperboard aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
            {t("space.selftape.whatFor")}
          </p>
          <p className="flex items-start gap-2 font-bold">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
            {t("space.selftape.whereGoes")}
          </p>
        </div>
      </div>

      <SelfTapeStudio />

      <div className="space-y-3">
        <h2 className="font-display text-xl font-medium">{t("space.selftape.takes")}</h2>
        <RecordingsLibrary items={items} />
      </div>
    </div>
  );
}
