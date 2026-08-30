import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  CandidaturesList,
  type CandidatureRow,
} from "@/components/app/candidatures-list";

export const metadata: Metadata = { title: "Mes candidatures" };

export default async function CandidaturesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

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
    status: c.status,
    source: c.source,
    score: c.matchScore?.score ?? null,
    justification: c.matchScore?.justification ?? null,
    rateEuros: c.estimatedRateCents ? c.estimatedRateCents / 100 : null,
    appliedAt: c.appliedAt.toISOString(),
    auto: c.source === "AGENTAL",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">Mes candidatures</h1>
        <p className="text-fg-muted">
          Factuel et bienveillant — chaque statut, expliqué.
        </p>
      </div>
      <CandidaturesList rows={rows} />
    </div>
  );
}
