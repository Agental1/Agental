import { prisma } from "@/lib/db";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { nextMissingItem, profileGaps, scoreProfile, type MissingItem } from "@/domain/completeness";
import { parseJson, PhysicalTraits } from "@/domain/json";
import { readPreferences } from "@/domain/preferences";
import { IN_PROGRESS_STATUSES } from "@/domain/role-search";
import type { AssistantContext, MessageTopic } from "@/domain/assistant";

/**
 * The minimum the assistant needs for one topic, read on the server.
 * Whitelist only: no contact details, no content boundaries, no media links.
 * readPreferences already leaves the private content boundaries out.
 */
export async function buildAssistantContext(
  userId: string,
  topic: MessageTopic,
  locale: string
): Promise<AssistantContext> {
  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      stageName: true,
      birthDate: true,
      city: true,
      bio: true,
      physical: true,
      preferences: true,
      imdbUrl: true,
      portfolioUrl: true,
      media: { select: { type: true } },
      specialties: { select: { kind: true } },
    },
  });
  const { plan } = await getTalentPlan(userId);
  const ctx: AssistantContext = {
    topic,
    locale,
    name: (profile?.stageName ?? "").trim().split(/\s+/)[0] ?? "",
    plan,
  };
  if (!profile) return ctx;

  if (topic === "profile") {
    const input = {
      stageName: profile.stageName,
      birthDate: profile.birthDate,
      city: profile.city,
      bio: profile.bio,
      physical: parseJson(PhysicalTraits, profile.physical),
      specialtiesCount: profile.specialties.length,
      media: profile.media,
      imdbUrl: profile.imdbUrl,
      portfolioUrl: profile.portfolioUrl,
    };
    const missing: MissingItem[] = [];
    const next = nextMissingItem(input);
    if (next) missing.push(next);
    for (const gap of profileGaps(input)) if (!missing.includes(gap)) missing.push(gap);
    ctx.profile = {
      completeness: scoreProfile(input),
      missing,
      specialties: profile.specialties.map((s) => s.kind),
      preferences: readPreferences(profile.preferences),
      hasImdbLink: !!profile.imdbUrl,
      hasPortfolioLink: !!profile.portfolioUrl,
    };
  }

  if (topic === "application") {
    const [cands, searches] = await Promise.all([
      prisma.candidature.findMany({
        where: { artistProfileId: profile.id },
        orderBy: { appliedAt: "desc" },
        take: 10,
        select: { status: true, appliedAt: true, project: { select: { title: true } } },
      }),
      prisma.roleSearchRequest.count({
        where: { userId, status: { in: [...IN_PROGRESS_STATUSES] } },
      }),
    ]);
    ctx.applications = {
      items: cands.map((c) => ({
        title: c.project.title,
        status: c.status,
        appliedAt: c.appliedAt.toISOString().slice(0, 10),
      })),
      searchesInProgress: searches,
    };
  }
  return ctx;
}
