import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Film, Lock } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { SelfTapeStudio } from "@/components/talents/self-tape-studio";
import { parseJson } from "@/domain/json";
import { z } from "zod";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.selftape.title") };
}

const Breakdown = z.object({
  framing: z.number().default(0),
  light: z.number().default(0),
  sound: z.number().default(0),
});

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

  const takes = await prisma.selfTape.findMany({
    where: { media: { profileId: profile.id } },
    include: { media: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.selftape.title")}</h1>
        <p className="text-fg-muted">{t("space.selftape.subtitle")}</p>
        <p className="mt-3 flex items-center gap-2 text-[15px] font-bold">
          <Lock aria-hidden="true" className="size-4 shrink-0 text-accent" />
          {t("space.selftape.privacy")}
        </p>
      </div>

      <SelfTapeStudio />

      {takes.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-xl font-medium">{t("space.selftape.takes")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {takes.map((take) => {
              const b = parseJson(Breakdown, take.qualityBreakdown);
              return (
                <div
                  key={take.id}
                  className="rounded-sedan border border-border bg-surface p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Film className="size-4 text-accent" />{" "}
                      {t("space.selftape.take", { n: take.takeNumber })}
                    </span>
                    <span
                      className={`font-display text-lg ${
                        (take.qualityScore ?? 0) >= 75 ? "text-success" : "text-accent"
                      }`}
                    >
                      {take.qualityScore ?? "—"}
                    </span>
                  </div>
                  <video
                    src={`/api/media/${take.mediaId}`}
                    controls
                    className="mt-3 aspect-video w-full rounded-sedan bg-black object-cover"
                  />
                  <p className="mt-2 text-xs text-fg-muted">
                    {t("space.selftape.framing")} {b.framing} ·{" "}
                    {t("space.studio.lighting")} {b.light} ·{" "}
                    {t("space.selftape.sound")} {b.sound}
                  </p>
                  {take.lowBandwidth && (
                    <Badge variant="neutral" className="mt-2">
                      {t("space.selftape.degraded")}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
