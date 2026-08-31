import { toLocale } from "@/i18n/routing";
import { parseJson } from "@/domain/json";
import { MatchReasons } from "@/domain/match-reason";
import { CandidatureStatus } from "@/domain/enums";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  CandidaturesList,
  type CandidatureRow,
} from "@/components/app/candidatures-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.candidatures.title") };
}

export default async function CandidaturesPage({
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

  const candidatures = await prisma.candidature.findMany({
    where: { artistProfileId: profile.id },
    include: { project: true, matchScore: true },
    orderBy: { appliedAt: "desc" },
  });

  const rows: CandidatureRow[] = candidatures.map((c) => ({
    id: c.id,
    projectTitle: c.project.title,
    // Statuses are String columns validated by Zod at the domain boundary
    // (the house pattern). Narrowing here is what lets the label lookup be a
    // typed key rather than a cast.
    status: CandidatureStatus.catch("NEW").parse(c.status),
    source: c.source,
    score: c.matchScore?.score ?? null,
    reasons: parseJson(MatchReasons, c.matchScore?.reasons ?? null),
    rateEuros: c.estimatedRateCents ? c.estimatedRateCents / 100 : null,
    appliedAt: c.appliedAt.toISOString(),
    auto: c.source === "AGENTAL",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.candidatures.title")}</h1>
        <p className="text-fg-muted">
          {t("space.candidatures.subtitle")}
        </p>
      </div>
      <CandidaturesList rows={rows} />
    </div>
  );
}
