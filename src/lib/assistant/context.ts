import { prisma } from "@/lib/db";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { COMPLETENESS_SELECT } from "@/lib/completeness";
import {
  completenessInputOf,
  missingItems,
  profileGaps,
  scoreProfile,
  type MissingItem,
  type ProfileGap,
} from "@/domain/completeness";
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
    select: { id: true, ...COMPLETENESS_SELECT },
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
    const input = completenessInputOf(profile);
    // The next required item first, then optional ones the assistant may suggest.
    const missing: (MissingItem | ProfileGap)[] = [...missingItems(input)];
    for (const gap of profileGaps(input)) if (!missing.includes(gap)) missing.push(gap);
    ctx.profile = {
      completeness: scoreProfile(input),
      missing,
      specialties: profile.specialties.map((s) => s.kind),
      preferences: input.preferences,
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
