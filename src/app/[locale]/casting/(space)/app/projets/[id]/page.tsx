import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  ShortlistBoard,
  type ShortlistCard,
} from "@/components/casting/shortlist-board";
import { parseJson, parseStringArray, PhysicalTraits } from "@/domain/json";
import { MatchReasons } from "@/domain/match-reason";
import { z } from "zod";

export const metadata: Metadata = { title: "Short-list" };

const RoleShape = z.object({
  role: z.string().optional(),
  gender: z.string().optional(),
  ageMin: z.number().optional(),
  ageMax: z.number().optional(),
  accent: z.string().optional(),
  constraints: z.array(z.string()).default([]),
});

export default async function ProjectShortlistPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "casting" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
  });
  if (!membership) return null;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      candidatures: {
        include: {
          matchScore: true,
          artistProfile: {
            include: { media: { where: { isPrimary: true }, take: 1 } },
          },
          externalTalent: true,
        },
        orderBy: { estimatedRateCents: "asc" },
      },
    },
  });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  const role = parseJson(RoleShape, project.roleSpec);

  const cards: ShortlistCard[] = project.candidatures.map((c) => {
    const flags = parseStringArray(c.matchScore?.diversityFlags ?? "[]");
    if (c.artistProfile) {
      const phys = parseJson(PhysicalTraits, c.artistProfile.physical);
      return {
        id: c.id,
        name: c.artistProfile.stageName,
        score: c.matchScore?.score ?? null,
        reasons: parseJson(MatchReasons, c.matchScore?.reasons ?? null),
        source: "AGENTAL",
        status: c.status,
        rateEuros: c.estimatedRateCents ? c.estimatedRateCents / 100 : null,
        city: c.artistProfile.city,
        accents: phys.accents,
        isMinor: c.artistProfile.isMinor,
        primaryMediaId: c.artistProfile.media[0]?.id ?? null,
        ficheHref: `/casting/app/projets/${project.id}/talent/${c.id}`,
        similar: flags.includes("profil-similaire"),
      };
    }
    const d = parseJson(
      z.object({ city: z.string().optional(), accents: z.array(z.string()).default([]) }),
      c.externalTalent?.data ?? "{}"
    );
    return {
      id: c.id,
      name: c.externalTalent?.name ?? "Talent externe",
      score: c.matchScore?.score ?? null,
      reasons: parseJson(MatchReasons, c.matchScore?.reasons ?? null),
      source: "EXTERNAL",
      status: c.status,
      rateEuros: c.estimatedRateCents ? c.estimatedRateCents / 100 : null,
      city: d.city ?? null,
      accents: d.accents,
      isMinor: false,
      primaryMediaId: null,
      ficheHref: `/casting/app/projets/${project.id}/talent/${c.id}`,
      similar: flags.includes("profil-similaire"),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-medium">{project.title}</h1>
          <Badge variant="accent">{t("space.project.shortlist")}</Badge>
        </div>
        <p className="mt-1 text-fg-muted">
          Rôle « {role.role} »
          {role.ageMin != null && ` · ${role.ageMin}–${role.ageMax} ans`}
          {role.accent && ` · accent ${role.accent}`} · {cards.length} profils
          retenus
        </p>
      </div>

      <ShortlistBoard cards={cards} />
    </div>
  );
}
